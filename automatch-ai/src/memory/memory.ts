import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ConversationMessage } from "../utils/types.js";
import { PreferenceConstraintStateData, defaultCarProfile } from "../utils/preferences.js";

export type ShortTermMemory = {
  messages: ConversationMessage[];
  maxItems: number;
  lastUpdated?: string;
};

export type LongTermMemory = {
  reflections: string[];
  personaAdjustments: string[];
  frustrationCount: number;
  lastPlan?: string;
  lastUiHealthNote?: string;
};

export type SessionMemorySnapshot = {
  shortTerm: ShortTermMemory;
  working: PreferenceConstraintStateData;
  longTerm: LongTermMemory;
};

const defaultShortTerm = (): ShortTermMemory => ({
  messages: [],
  maxItems: 12,
  lastUpdated: new Date().toISOString(),
});

const defaultWorking = (): PreferenceConstraintStateData => ({
  product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] },
  conversation: {},
  style: {},
  carProfile: defaultCarProfile(),
  filters: {},
});

const defaultLongTerm = (): LongTermMemory => ({
  reflections: [],
  personaAdjustments: [],
  frustrationCount: 0,
  lastPlan: "",
  lastUiHealthNote: "",
});

const defaultSnapshot = (): SessionMemorySnapshot => ({
  shortTerm: defaultShortTerm(),
  working: defaultWorking(),
  longTerm: defaultLongTerm(),
});

const memoryDir = () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..", "..", "data", "memory");
};

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

export class ShortTermMemoryWindow {
  private state: ShortTermMemory;

  constructor(state?: ShortTermMemory) {
    this.state = state ? { ...state } : defaultShortTerm();
  }

  add(turn: ConversationMessage[]) {
    const merged = [...this.state.messages, ...turn];
    const limited = merged.slice(-(this.state.maxItems || 12));
    this.state = {
      ...this.state,
      messages: limited,
      lastUpdated: new Date().toISOString(),
    };
  }

  mergeHistory(history: ConversationMessage[]) {
    if (!history?.length) return;
    this.add(history);
  }

  snapshot() {
    return { ...this.state, messages: [...this.state.messages] };
  }
}

export class MemoryManager {
  private baseDir: string;

  constructor(baseDir = memoryDir()) {
    this.baseDir = baseDir;
    ensureDir(this.baseDir);
  }

  private path(sessionId: string) {
    return path.join(this.baseDir, `${sessionId}.json`);
  }

  load(sessionId: string): SessionMemorySnapshot {
    try {
      const file = this.path(sessionId);
      if (!fs.existsSync(file)) return defaultSnapshot();
      const raw = fs.readFileSync(file, "utf-8");
      const parsed = JSON.parse(raw) as SessionMemorySnapshot;
      return {
        shortTerm: { ...defaultShortTerm(), ...(parsed.shortTerm || {}), messages: parsed.shortTerm?.messages || [] },
        working: { ...defaultWorking(), ...(parsed.working || {}) },
        longTerm: { ...defaultLongTerm(), ...(parsed.longTerm || {}) },
      };
    } catch (err) {
      return defaultSnapshot();
    }
  }

  persist(sessionId: string, snapshot: SessionMemorySnapshot) {
    try {
      const file = this.path(sessionId);
      const serializable: SessionMemorySnapshot = {
        shortTerm: { ...snapshot.shortTerm, messages: snapshot.shortTerm.messages.slice(-(snapshot.shortTerm.maxItems || 12)) },
        working: snapshot.working,
        longTerm: snapshot.longTerm,
      };
      fs.writeFileSync(file, JSON.stringify(serializable, null, 2), "utf-8");
    } catch (err) {
      // best effort persistence; do not throw
    }
  }

  update(sessionId: string, updater: (current: SessionMemorySnapshot) => SessionMemorySnapshot) {
    const current = this.load(sessionId);
    const next = updater(current);
    this.persist(sessionId, next);
    return next;
  }
}

export const mergeMemory = (
  incoming: SessionMemorySnapshot | undefined,
  history: ConversationMessage[] = [],
): SessionMemorySnapshot => {
  const snapshot = incoming || defaultSnapshot();
  const window = new ShortTermMemoryWindow(snapshot.shortTerm);
  window.mergeHistory(history);
  return {
    shortTerm: window.snapshot(),
    working: snapshot.working || defaultWorking(),
    longTerm: snapshot.longTerm || defaultLongTerm(),
  };
};
