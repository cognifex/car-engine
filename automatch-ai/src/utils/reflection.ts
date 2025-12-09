import fs from "fs";
import path from "path";

const REFLECTION_FILE = path.join(process.cwd(), "data", "reflections.json");

type ReflectionEntry = {
  reason: string;
  intent?: string;
  gatingReason?: string;
  timestamp: string;
};

const ensureFile = () => {
  const dir = path.dirname(REFLECTION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(REFLECTION_FILE)) fs.writeFileSync(REFLECTION_FILE, "[]", "utf-8");
};

export const recordReflection = (entry: Omit<ReflectionEntry, "timestamp">) => {
  try {
    ensureFile();
    const raw = fs.readFileSync(REFLECTION_FILE, "utf-8");
    const existing = JSON.parse(raw || "[]") as ReflectionEntry[];
    const next = [...existing.slice(-50), { ...entry, timestamp: new Date().toISOString() }];
    fs.writeFileSync(REFLECTION_FILE, JSON.stringify(next, null, 2));
  } catch (err) {
    // best effort only
  }
};

export const loadReflectionSummary = () => {
  try {
    if (!fs.existsSync(REFLECTION_FILE)) return "";
    const raw = fs.readFileSync(REFLECTION_FILE, "utf-8");
    const entries = (JSON.parse(raw) as ReflectionEntry[]).slice(-5);
    if (!entries.length) return "";
    const grouped = entries.reduce<Record<string, number>>((acc, cur) => {
      acc[cur.reason] = (acc[cur.reason] || 0) + 1;
      return acc;
    }, {});
    const top = Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `${reason} (${count}x)`)
      .join("; ");
    return `Letzte Muster: ${top}.`;
  } catch (err) {
    return "";
  }
};
