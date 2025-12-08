// Plain JS scraper to avoid tsx/loader issues.
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), override: true });
dotenv.config({ path: path.resolve(__dirname, "..", "..", "backend", ".env"), override: true });

const OUT_FILE = path.resolve(__dirname, "..", "data", "specs.json");
const MISSING_FILE = path.resolve(__dirname, "..", "data", "specs-missing.json");
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || process.env.MAX_PAGES || 300); // pages per batch
const START_AT = Number(process.env.START_AT || 0); // offset to resume
const TOTAL_LIMIT = Number.isFinite(Number(process.env.TOTAL_LIMIT)) ? Number(process.env.TOTAL_LIMIT) : Infinity; // optional cap
const DELAY_MS = Number(process.env.DELAY_MS || 500); // throttle between requests
const PROXY_URL_RAW = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || "";
const PROXY_URL = PROXY_URL_RAW.includes("<") ? "" : PROXY_URL_RAW; // ignore placeholder
const SITEMAP_INDEX = "https://www.ultimatespecs.com/sitemap.xml";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const parseKw = (text) => {
  if (!text) return undefined;
  const m = text.match(/(\d+)\s*kW/i);
  return m ? Number(m[1]) : undefined;
};

const slugify = (text = "") => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const slugInUrl = (url, slug) => {
  if (!slug) return false;
  const compact = slug.replace(/-/g, "");
  return url.includes(slug) || url.includes(compact);
};
const parseWidth = (url) => Number(url.toLowerCase().match(/w(\d{2,4})/)?.[1] || 0);

const parseIntSafe = (text) => {
  if (!text) return undefined;
  const m = text.match(/(\d+)/);
  return m ? Number(m[1]) : undefined;
};

const makeFetch = () => {
  if (!PROXY_URL) return (url, opts = {}) => undiciFetch(url, { ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
  const agent = new ProxyAgent(PROXY_URL);
  return (url, opts = {}) => undiciFetch(url, { ...opts, dispatcher: agent, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
};

const fetchWithProxy = makeFetch();

async function scrapePage(url) {
  const resp = await fetchWithProxy(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  const get = (label) => {
    const re = new RegExp(`${label}[^<]*</td>\\s*<td[^>]*>([^<]+)<`, "i");
    const m = html.match(re);
    return m ? m[1].trim() : undefined;
  };
  const brandModel = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] || "";
  let parts = brandModel.trim().split(/\s+/).filter(Boolean);
  // Fallback: derive from URL segments (brand/id/slug)
  if (parts.length < 2) {
    const seg = url.split("/car-specs/")[1] || "";
    const segParts = seg.split("/");
    const brandFromUrl = segParts[0]?.replace(/-/g, " ") || "";
    let slug = segParts[2] || segParts[1] || "";
    slug = slug.replace(/\.html$/i, "");
    let modelFromUrl = slug.replace(/-/g, " ").trim();
    // Strip brand prefix if duplicated
    if (brandFromUrl && modelFromUrl.toLowerCase().startsWith(brandFromUrl.toLowerCase())) {
      modelFromUrl = modelFromUrl.slice(brandFromUrl.length).trim();
    }
    parts = [brandFromUrl, modelFromUrl].filter(Boolean);
  }
  const brand = parts[0] || "";
  const model = parts.slice(1).join(" ") || brandModel || url;
  const image = (() => {
    const makeFull = (raw) => (raw.startsWith("http") ? raw : `https:${raw}`);
    const tag = html.match(/<img[^>]*class=["'][^"']*left_column_top_model_image[^"']*[^>]*>/i)?.[0];
    if (!tag) return undefined;
    const mainImg = tag.match(/src=["']([^"']+)["']/i)?.[1];
    return mainImg ? makeFull(mainImg) : undefined;
  })();
  if (!image) return null; // skip datasets ohne Hauptbild
  return {
    brand,
    model,
    year: get("Jahr"),
    bodyType: get("Karosserie"),
    fuel: get("Kraftstoff"),
    enginePowerKw: parseKw(get("Leistung")),
    transmission: get("Getriebe"),
    drivetrain: get("Antrieb"),
    seats: parseIntSafe(get("Sitze")),
    doors: parseIntSafe(get("Türen")),
    image,
    url,
  };
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function loadSitemaps() {
  const indexXml = await (await fetchWithProxy(SITEMAP_INDEX)).text();
  const maps = [...(indexXml.match(/https:\/\/www\.ultimatespecs\.com\/[^<]+\.xml/g) || [])];
  // prefer car sitemaps only
  return maps.filter((m) => m.includes("sitemapcars"));
}

async function loadUrlsFromSitemap(url) {
  const xml = await (await fetchWithProxy(url)).text();
  const locs = [...(xml.match(/https:\/\/www\.ultimatespecs\.com\/[^<]+\.html/g) || [])];
  // Prefer German pages to reduce duplicates across languages
  const german = locs.filter((u) => u.includes("/de/car-specs/"));
  const fallback = locs.filter((u) => u.includes("/car-specs/"));
  return german.length > 0 ? german : fallback;
}

async function main() {
  const sitemapUrls = await loadSitemaps();
  const detailUrls = [];
  for (const sm of sitemapUrls) {
    console.log("Loading sitemap", sm);
    const urls = await loadUrlsFromSitemap(sm);
    for (const u of urls) {
      detailUrls.push(u);
      if (detailUrls.length >= TOTAL_LIMIT) break;
    }
    if (detailUrls.length >= TOTAL_LIMIT) break;
  }

  const remaining = detailUrls.slice(START_AT, TOTAL_LIMIT);
  console.log(
    `Collected ${detailUrls.length} detail URLs, processing from ${START_AT} in batches of ${CHUNK_SIZE}${
      Number.isFinite(TOTAL_LIMIT) ? ` (cap ${TOTAL_LIMIT})` : ""
    }`
  );

  const specs = [];
  const missingImages = [];
  let processed = 0;

  for (let offset = 0; offset < remaining.length; offset += CHUNK_SIZE) {
    const chunk = remaining.slice(offset, offset + CHUNK_SIZE);
    console.log(`\n=== Chunk ${offset + START_AT}..${offset + START_AT + chunk.length - 1} ===`);

    let chunkCount = 0;
    for (const url of chunk) {
      try {
        console.log(`Scraping ${++chunkCount}/${chunk.length}: ${url}`);
        const spec = await scrapePage(url);
        if (spec) {
          specs.push(spec);
          console.log(
            `  → ${spec.brand} | ${spec.model}${spec.image ? ` | img: ${spec.image}` : " | img: none"}`
          );
        } else {
          missingImages.push(url);
          console.log("  → skipped (no left_column_top_model_image)");
        }
      } catch (err) {
        console.warn("Failed to scrape", url, err?.message || err);
      }
      processed++;
      await sleep(DELAY_MS);
    }

    // Persist after each chunk to avoid losing progress
    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
    await fs.writeFile(OUT_FILE, JSON.stringify(specs, null, 2));
    await fs.writeFile(MISSING_FILE, JSON.stringify(missingImages, null, 2));
    console.log(
      `Chunk saved. Total processed so far: ${processed}. Specs: ${specs.length}, Missing: ${missingImages.length}`
    );
  }

  console.log(`Done. Specs saved to ${OUT_FILE}, missing-image URLs to ${MISSING_FILE}`);
}

main().catch((err) => {
  console.error("Scrape failed", err);
  process.exit(1);
});
