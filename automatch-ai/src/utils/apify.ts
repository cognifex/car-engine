import { OfferType } from "./types.js";
import { logger } from "./logger.js";
import { settings } from "../config/settings.js";
import { ApifyClient } from "apify-client";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const APIFY_ACTOR = "lexis-solutions~mobile-de-auto-scraper";
const APIFY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DISK_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const APIFY_TIMEOUT_MS = 45 * 1000; // bail out quickly to avoid blocking chat
const APIFY_WAIT_SECS = 120; // hard cap for waitForFinish
const DB_MAX_ITEMS = 500;

type CacheKey = string;
const apifyCache = new Map<CacheKey, { ts: number; offers: ReturnType<typeof OfferType.parse>[] }>();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DISK_CACHE = path.resolve(__dirname, "..", "..", ".cache", "hot-offers.json");
const DB_PATH = path.resolve(__dirname, "..", "..", ".cache", "offers-db.json");
const ensureCacheDir = async () => {
  const dir = path.dirname(DISK_CACHE);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }
};

export const readOffersDB = async () => {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeDB = async (items: any[]) => {
  try {
    await ensureCacheDir();
    const trimmed = items.slice(-DB_MAX_ITEMS);
    await fs.writeFile(DB_PATH, JSON.stringify(trimmed));
  } catch (err) {
    logger.warn({ err: (err as any)?.message || err }, "Failed to write offers DB");
  }
};

const authHeaders = () => ({
  Authorization: `Bearer ${settings.AUTO_DEV_TOKEN}`,
  "Content-Type": "application/json",
});

const safeFetch = async (url: string) => {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`auto.dev error ${res.status}: ${text}`);
  }
  return res.json();
};

export const fetchVehicleListings = async (params: {
  brand?: string;
  model?: string;
  maxItems?: number;
  zip?: string;
  distance?: number;
  maxPrice?: number;
  countryHint?: string;
}): Promise<ReturnType<typeof OfferType.parse>[]> => {
  logger.warn("fetchVehicleListings disabled (auto.dev removed)");
  return [];
};

export const fetchVehiclePhotos = async (params: { brand?: string; model?: string; vin?: string; limit?: number }): Promise<string[]> => {
  logger.warn("fetchVehiclePhotos disabled (auto.dev removed)");
  return [];
};

export const fetchApifyMobileListings = async (params: {
  brand?: string;
  model?: string;
  maxItems?: number;
  maxPrice?: number;
}): Promise<ReturnType<typeof OfferType.parse>[]> => {
  const stamp = () => new Date().toISOString();
  const withDefaults = (o: any) => ({
    ...o,
    created_at: o.created_at || stamp(),
    isOffroadRelevant: Boolean(o.isOffroadRelevant),
    isExactMatchToSuggestion: Boolean(o.isExactMatchToSuggestion),
    relevanceScore: Number(o.relevanceScore ?? 0),
    source: o.source || "apify",
    fallbackReason: o.fallbackReason || "",
  });

  const token = settings.APIFY_TOKEN;
  if (!token) {
    logger.warn("APIFY_TOKEN not set; skipping Apify listings");
    return [];
  }
  const splitGuess = (value?: string) => {
    if (!value) return { b: "", m: "" };
    const parts = value.split(/\s+/);
    if (parts.length < 2) return { b: "", m: value };
    return { b: parts[0], m: parts.slice(1).join(" ") };
  };

  const guess = splitGuess(params.model);
  const brand = params.brand || guess.b;
  const model = params.model || guess.m;
  if (!brand || !model) {
    logger.warn({ brand, model }, "Apify listings skipped: missing brand/model after guess");
    return [];
  }

  const cacheKey = `${brand}:${model}:${params.maxPrice || ""}:${params.maxItems || ""}`;
  const now = Date.now();
  const cached = apifyCache.get(cacheKey);
  if (cached && now - cached.ts < APIFY_CACHE_TTL_MS) {
    logger.info({ cacheKey }, "Returning cached Apify listings");
    return (cached.offers || []).map(withDefaults);
  }
  // disk cache fallback
  try {
    const raw = await fs.readFile(DISK_CACHE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    const diskEntry = parsed[cacheKey];
    if (diskEntry && now - diskEntry.ts < DISK_CACHE_TTL_MS) {
      logger.info({ cacheKey }, "Returning disk-cached Apify listings");
      apifyCache.set(cacheKey, diskEntry);
      return (diskEntry.offers || []).map(withDefaults);
    }
  } catch {
    // ignore
  }

  try {
    const client = new ApifyClient({ token });
    const input: Record<string, unknown> = {
      brand: brand || "Toyota",
      model: model || "Yaris",
      maxItems: Math.min(params.maxItems ?? 3, 5),
    };
    logger.info({ brand, model, maxItems: input.maxItems }, "Fetching mobile.de listings via Apify");

    const start = Date.now();
    const runPromise = (async () => {
      const started = await client.actor(APIFY_ACTOR).start(input);
      const finished = await client.run(started.id).waitForFinish({ waitSecs: APIFY_WAIT_SECS });
      const datasetId = finished?.defaultDatasetId || started.defaultDatasetId;
      const items = datasetId ? (await client.dataset(datasetId).listItems()).items || [] : [];
      return { items, status: finished?.status };
    })();

    const withTimeout = await Promise.race([
      runPromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Apify timeout")), APIFY_TIMEOUT_MS)),
    ]);

    const items = withTimeout.items || [];
    const duration = Date.now() - start;
    logger.info({ count: items.length, ms: duration, status: withTimeout.status }, "Apify mobile.de listings fetched");

    const normalize = (item: any) => {
      const price = Number(item.price ?? item.priceValue ?? 0) || 0;
      const image = item.primaryImage || item.image || item.imageUrl || (Array.isArray(item.imgUrls) ? item.imgUrls[0] : "") || "";
      const mileageRaw = item.mileage ?? item.kilometers ?? item.km ?? "";
      const mileage = typeof mileageRaw === "number" ? `${mileageRaw.toLocaleString("de-DE")} km` : mileageRaw;
      const location = item.location || item.sellerLocation || "Deutschland (online)";
      const dealer = item.seller || item.dealer || "mobile.de Händler";
      const link = item.url || item.link || "";
      const title = item.title || `${brand} ${model}`.trim() || "Fahrzeug";
      const badgeParts = [
        item.transmission,
        item.powerKw ? `${item.powerKw} kW` : "",
        item.firstRegistrationDate ? `EZ ${item.firstRegistrationDate}` : "",
      ].filter(Boolean);
      const featureTop = Array.isArray(item.features) ? item.features.slice(0, 3).join(", ") : "";

      const normalized = {
        title,
        model: item.model || model || "",
        price,
        dealer,
        link,
        image_url: typeof image === "string" && image.startsWith("http") ? image : "",
        location,
        mileage,
        badge: badgeParts.join(" • ") || featureTop,
        vin: item.vin || "",
      };
      return normalized;
    };

    const normalized = items
      .map(normalize)
      .filter(o => OfferType.safeParse(o).success)
      // Do not drop offers by price; the caller can trim later. Filtering too aggressively caused empty results.
      .sort((a, b) => (a.price || 0) - (b.price || 0));
    const stampedNormalized = normalized.map(o => withDefaults({ ...o, created_at: stamp() }));

    logger.info({ count: normalized.length }, "Apify mobile.de listings normalized");
    if (stampedNormalized.length > 0) {
      const entry = { ts: now, offers: stampedNormalized };
      apifyCache.set(cacheKey, entry);
      await ensureCacheDir();
      try {
        const raw = await fs.readFile(DISK_CACHE, "utf8").catch(() => "{}");
        const parsed = JSON.parse(raw || "{}");
        parsed[cacheKey] = entry;
        await fs.writeFile(DISK_CACHE, JSON.stringify(parsed));
      } catch (err) {
        logger.warn({ err: (err as any)?.message || err }, "Failed to write disk cache");
      }
      // append to offers DB
      try {
        const db = await readOffersDB();
        const merged = [...db, ...stampedNormalized];
        await writeDB(merged);
      } catch (err) {
        logger.warn({ err: (err as any)?.message || err }, "Failed to append offers to DB");
      }
      return stampedNormalized;
    } else if (cached) {
      logger.warn({ cacheKey }, "Apify returned no offers; falling back to cached");
      return cached.offers;
    } else {
      try {
        const raw = await fs.readFile(DISK_CACHE, "utf8");
        const parsed = JSON.parse(raw || "{}");
        const diskEntry = parsed[cacheKey];
        if (diskEntry && now - diskEntry.ts < DISK_CACHE_TTL_MS) {
          logger.warn({ cacheKey }, "Apify empty; returning disk cache");
          return (diskEntry.offers || []).map(withDefaults);
        }
      } catch {
        // ignore
      }
    }
    return stampedNormalized;
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Failed to fetch Apify mobile.de listings");
    if (cached) {
      logger.warn({ cacheKey }, "Returning cached Apify offers after error");
      return (cached.offers || []).map(withDefaults);
    }
    try {
      const raw = await fs.readFile(DISK_CACHE, "utf8");
      const parsed = JSON.parse(raw || "{}");
      const diskEntry = parsed[cacheKey];
      if (diskEntry && now - diskEntry.ts < DISK_CACHE_TTL_MS) {
        logger.warn({ cacheKey }, "Returning disk cache after error");
        return (diskEntry.offers || []).map(withDefaults);
      }
    } catch {
      // ignore
    }
    return [];
  }
};
