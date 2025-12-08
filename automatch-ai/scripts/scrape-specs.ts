import scraper from "website-scraper";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Minimal scraper to pull static HTML pages from ultimatespecs and extract basic specs.
 * This is intentionally simple: we rely on CSS selectors that are stable for the
 * sample pages. Extend the URL list to cover more models/brands.
 */

type SpecModel = {
  brand: string;
  model: string;
  year?: string;
  bodyType?: string;
  fuel?: string;
  enginePowerKw?: number;
  transmission?: string;
  drivetrain?: string;
  seats?: number;
  doors?: number;
  image?: string;
  url?: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_FILE = path.resolve(__dirname, "..", "data", "specs.json");

// Extend this list as needed
const PAGES = [
  "https://www.ultimatespecs.com/de/car-specs/Volkswagen/13206/Volkswagen-T-Cross-10-TSI-DSG-115HP-Life.html",
  "https://www.ultimatespecs.com/de/car-specs/Skoda/12912/Skoda-Fabia-10-TSI-110HP-Style.html",
  "https://www.ultimatespecs.com/de/car-specs/Ford/10909/Ford-Fiesta-10-EcoBoost-125HP-Titanium.html",
  "https://www.ultimatespecs.com/de/car-specs/Dacia/13706/Dacia-Duster-13-TCe-150-4x4-Prestige.html",
  "https://www.ultimatespecs.com/de/car-specs/Toyota/12631/Toyota-Yaris-16-Hybrid-116HP-Design.html",
  "https://www.ultimatespecs.com/de/car-specs/Opel/13493/Opel-Astra-Sports-Tourer-13-Turbo-130HP-Automatic-Elegance.html",
];

const parseKw = (text: string | undefined) => {
  if (!text) return undefined;
  const m = text.match(/(\d+)\s*kW/i);
  return m ? Number(m[1]) : undefined;
};

const parseIntSafe = (text: string | undefined) => {
  if (!text) return undefined;
  const m = text.match(/(\d+)/);
  return m ? Number(m[1]) : undefined;
};

async function scrapePage(url: string, dir: string): Promise<SpecModel | null> {
  const result = await scraper({
    urls: [url],
    directory: dir,
    sources: [],
    recursive: false,
    maxDepth: 1,
  });
  const saved = result[0]?.filename;
  if (!saved) return null;
  const html = fs.readFileSync(path.join(dir, saved), "utf8");
  // Very lightweight parsing using regex; for production, replace with cheerio.
  const get = (label: string) => {
    const re = new RegExp(`${label}[^<]*</td>\\s*<td[^>]*>([^<]+)<`, "i");
    const m = html.match(re);
    return m ? m[1].trim() : undefined;
  };
  const brandModel = html.match(/<h1[^>]*>([^<]+)<\\/h1>/i)?.[1] || "";
  const [brand, ...rest] = brandModel.split(" ");
  const model = rest.join(" ") || brandModel;
  const image = html.match(/<img[^>]+src="([^"]+)"[^>]*class="spec_image"/i)?.[1];

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

async function main() {
  const tmpDir = path.resolve(__dirname, "..", ".cache", "scrape");
  fs.mkdirSync(tmpDir, { recursive: true });

  const specs: SpecModel[] = [];
  for (const url of PAGES) {
    try {
      console.log("Scraping", url);
      const spec = await scrapePage(url, tmpDir);
      if (spec) specs.push(spec);
    } catch (err: any) {
      console.warn("Failed to scrape", url, err?.message || err);
    }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(specs, null, 2));
  console.log(`Saved ${specs.length} specs to ${OUT_FILE}`);
}

main().catch(err => {
  console.error("Scrape failed", err);
  process.exit(1);
});
