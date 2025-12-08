import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export type SpecModel = {
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
const SPEC_PATH = path.resolve(__dirname, "..", "..", "data", "specs.json");
const SPEC_SAMPLE_PATH = path.resolve(__dirname, "..", "..", "data", "specs-sample.json");

let cache: SpecModel[] | null = null;

export const loadSpecs = (): SpecModel[] => {
  if (cache) return cache;
  const read = (p: string) => {
    try {
      const raw = fs.readFileSync(p, "utf8");
      const parsed = JSON.parse(raw || "[]");
      if (Array.isArray(parsed)) return parsed as SpecModel[];
    } catch {
      return [];
    }
    return [];
  };

  const primary = read(SPEC_PATH);
  if (primary.length > 0) {
    cache = primary;
    return primary;
  }
  const sample = read(SPEC_SAMPLE_PATH);
  cache = sample;
  return sample;
};
