import { loadSpecs, SpecModel } from "./specs.js";

export interface OfferFilters {
  bodyType?: string;
  brand?: string;
  maxAgeYears?: number;
  fuelIncludes?: string;
  retro?: boolean;
  sortByPower?: boolean;
  limit?: number;
  dedupe?: boolean;
  shuffle?: boolean;
}

const normalize = (s: string) => s?.toLowerCase().trim();

const passesBodyType = (spec: SpecModel, bodyType?: string) => {
  if (!bodyType) return true;
  const wanted = normalize(bodyType);
  const current = normalize(spec.bodyType || "");
  return current.includes(wanted);
};

const passesBrand = (spec: SpecModel, brand?: string) => {
  if (!brand) return true;
  return normalize(spec.brand || "").includes(normalize(brand));
};

const passesAge = (spec: SpecModel, maxAgeYears?: number) => {
  if (!maxAgeYears) return true;
  const yearNum = Number(String(spec.year).slice(0, 4));
  if (!yearNum) return false;
  const currentYear = new Date().getFullYear();
  return currentYear - yearNum <= maxAgeYears;
};

const passesFuel = (spec: SpecModel, fuel?: string) => {
  if (!fuel) return true;
  return normalize(spec.fuel || "").includes(normalize(fuel));
};

const passesRetro = (spec: SpecModel, retro?: boolean) => {
  if (!retro) return true;
  const yearNum = Number(String(spec.year).slice(0, 4));
  if (!yearNum) return false;
  return yearNum <= 1990;
};

const dedupeByKey = (items: SpecModel[]) => {
  const seen = new Set<string>();
  return items.filter((spec) => {
    const key = `${normalize(spec.brand || "")}|${normalize(spec.model || "")}|${spec.image || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const shuffle = <T>(arr: T[]) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const sortByPowerDesc = (arr: SpecModel[]) => {
  return [...arr].sort((a, b) => {
    const pa = Number(a.enginePowerKw || 0);
    const pb = Number(b.enginePowerKw || 0);
    return pb - pa;
  });
};

export const getOffers = (filters: OfferFilters = {}) => {
  const specs = loadSpecs();
  const filtered = specs.filter(
    (s) =>
      s.image &&
      passesBodyType(s, filters.bodyType) &&
      passesBrand(s, filters.brand) &&
      passesAge(s, filters.maxAgeYears) &&
      passesFuel(s, filters.fuelIncludes) &&
      passesRetro(s, filters.retro)
  );
  const deduped = filters.dedupe === false ? filtered : dedupeByKey(filtered);
  const orderedBase = filters.sortByPower ? sortByPowerDesc(deduped) : deduped;
  const ordered = filters.shuffle ? shuffle(orderedBase) : orderedBase;
  const limit = filters.limit ?? 6;
  return ordered.slice(0, limit).map((spec, index) => ({ ...spec, index }));
};

export const getOfferByPosition = (row: number, col: number, columns = 3, filters: OfferFilters = {}) => {
  const offers = getOffers(filters);
  const idx = row * columns + col;
  return offers[idx];
};

export const listModels = () => {
  const specs = loadSpecs();
  return specs.map((s) => `${s.brand} ${s.model}`.trim());
};
