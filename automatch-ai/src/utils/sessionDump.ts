import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ClientEvent,
  ConversationMessage,
  ContentPayload,
  IntentOutput,
  MatchingOutput,
  Offer,
  PerfectProfile,
  RouteDecision,
  UIRecoveryInstruction,
  UIState,
} from "./types.js";

export interface NodeTrace {
  name: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  error?: { message: string; stack?: string };
}

export interface OfferHistorySnapshot {
  timestamp: string;
  offers: Offer[];
  meta?: Record<string, unknown>;
}

export interface SessionTurnTrace {
  turnId: string;
  startedAt: string;
  endedAt: string;
  userMessage: string;
  reply: string;
  followUp?: string;
  nodes: NodeTrace[];
  intent?: IntentOutput;
  profile?: PerfectProfile;
  routing?: RouteDecision;
  matching?: MatchingOutput;
  offers?: Offer[];
  offersMeta?: Record<string, unknown>;
  offerSearchState?: { failureCount?: number; lastStrategy?: string };
  offersHistory?: OfferHistorySnapshot[];
  content?: ContentPayload;
  uiPresentedOffers?: Offer[];
  semanticallyFocusedModels?: string[];
  clientEvents?: ClientEvent[];
  uiState?: UIState;
  uiRecovery?: UIRecoveryInstruction;
}

export interface ConversationEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface SessionDump {
  metadata: {
    sessionId: string;
    startedAt: string;
    completedAt?: string;
    modelId?: string;
    redacted?: boolean;
  };
  conversation: ConversationEntry[];
  turns: SessionTurnTrace[];
  errors: { node: string; message: string; stack?: string }[];
  clientEvents?: ClientEvent[];
}

const defaultBaseDir = () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..", "..", "data", "session-dumps");
};

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export class SessionDumpStore {
  private baseDir: string;

  constructor(baseDir: string = defaultBaseDir()) {
    this.baseDir = baseDir;
    ensureDir(this.baseDir);
  }

  private filePath(sessionId: string) {
    return path.join(this.baseDir, `${sessionId}.json`);
  }

  load(sessionId: string): SessionDump | null {
    try {
      const file = this.filePath(sessionId);
      if (!fs.existsSync(file)) return null;
      const raw = fs.readFileSync(file, "utf-8");
      return JSON.parse(raw) as SessionDump;
    } catch (err) {
      console.error("Failed to load session dump", err);
      return null;
    }
  }

  save(dump: SessionDump) {
    try {
      const file = this.filePath(dump.metadata.sessionId);
      fs.writeFileSync(file, JSON.stringify(dump, null, 2));
    } catch (err) {
      console.error("Failed to persist session dump", err);
    }
  }

  merge(dump: SessionDump) {
    const existing = this.load(dump.metadata.sessionId);
    if (!existing) {
      this.save(dump);
      return;
    }

    const merged: SessionDump = {
      metadata: {
        ...existing.metadata,
        ...dump.metadata,
        startedAt: existing.metadata.startedAt || dump.metadata.startedAt,
        completedAt: dump.metadata.completedAt || existing.metadata.completedAt,
      },
      conversation: [...existing.conversation, ...dump.conversation],
      turns: [...existing.turns, ...dump.turns],
      errors: [...existing.errors, ...dump.errors],
    };

    this.save(merged);
  }
}

interface CollectorOptions {
  sessionId: string;
  modelId?: string;
  redacted?: boolean;
  store?: SessionDumpStore;
}

interface TurnContext {
  turnId: string;
  startedAt: Date;
  history: ConversationMessage[];
  userMessage: string;
  clientEvents: ClientEvent[];
}

export class SessionTraceCollector {
  private readonly sessionId: string;
  private readonly modelId?: string;
  private readonly redacted: boolean;
  private readonly store: SessionDumpStore;
  private readonly startedAt: Date;
  private conversation: ConversationEntry[] = [];
  private turns: SessionTurnTrace[] = [];
  private errors: { node: string; message: string; stack?: string }[] = [];
  private clientEvents: ClientEvent[] = [];
  private turnCounter = 0;
  private currentTurn?: TurnContext;
  private currentNodes: NodeTrace[] = [];

  constructor(options: CollectorOptions) {
    this.sessionId = options.sessionId;
    this.modelId = options.modelId;
    this.redacted = Boolean(options.redacted);
    this.store = options.store ?? new SessionDumpStore();
    this.startedAt = new Date();
  }

  startTurn(payload: { userMessage: string; history: ConversationMessage[]; clientEvents?: ClientEvent[] }) {
    try {
      this.turnCounter += 1;
      this.currentNodes = [];
      this.currentTurn = {
        turnId: `turn-${this.turnCounter}`,
        startedAt: new Date(),
        history: payload.history || [],
        userMessage: payload.userMessage,
        clientEvents: payload.clientEvents || [],
      };
      this.clientEvents = [...this.clientEvents, ...(payload.clientEvents || [])];
    } catch (err) {
      console.error("SessionTraceCollector startTurn failed", err);
    }
  }

  recordNode(event: {
    name: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    startedAt?: Date;
    endedAt?: Date;
    error?: unknown;
  }) {
    if (!this.currentTurn) return;
    try {
      const started = event.startedAt || new Date();
      const ended = event.endedAt || new Date();
      const trace: NodeTrace = {
        name: event.name,
        input: event.input,
        output: event.output,
        startedAt: started.toISOString(),
        endedAt: ended.toISOString(),
        durationMs: ended.getTime() - started.getTime(),
      };

      if (event.error) {
        const errObj = event.error as Error;
        trace.error = { message: errObj.message || String(event.error), stack: errObj.stack };
        this.errors.push({ node: event.name, message: trace.error.message, stack: trace.error.stack });
      }

      this.currentNodes.push(trace);
    } catch (err) {
      console.error("SessionTraceCollector recordNode failed", err);
    }
  }

  private redactText(text: string) {
    if (!this.redacted) return text;
    return text ? "[redacted]" : text;
  }

  finishTurn(payload: { reply: string; followUp?: string; state: Record<string, unknown> }) {
    if (!this.currentTurn) return;
    try {
      const endedAt = new Date();
      const turn: SessionTurnTrace = {
        turnId: this.currentTurn.turnId,
        startedAt: this.currentTurn.startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        userMessage: this.redactText(this.currentTurn.userMessage),
        reply: this.redactText(payload.reply || ""),
        followUp: this.redactText(payload.followUp || ""),
        nodes: [...this.currentNodes],
        intent: payload.state.intent as IntentOutput,
        profile: payload.state.profile as PerfectProfile,
        routing: payload.state.route as RouteDecision,
        matching: payload.state.matches as MatchingOutput,
        offers: payload.state.offers as Offer[],
        offersMeta: payload.state.offersMeta as Record<string, unknown>,
        offerSearchState: payload.state.offerSearchState as { failureCount?: number; lastStrategy?: string },
        offersHistory: (payload.state.offersMeta as any)?.offersHistory || [],
        content: payload.state.content as ContentPayload,
        uiPresentedOffers: (payload.state.content as ContentPayload | undefined)?.offers,
        semanticallyFocusedModels: this.deriveSemanticModels(payload.state),
        clientEvents: (payload.state.clientEvents as ClientEvent[]) || this.currentTurn.clientEvents || [],
        uiState: payload.state.uiState as UIState,
        uiRecovery: payload.state.uiRecovery as UIRecoveryInstruction,
      };

      const convoTimestamp = endedAt.toISOString();
      this.conversation.push(
        {
          id: `${turn.turnId}-user`,
          role: "user",
          text: this.redactText(this.currentTurn.userMessage),
          timestamp: this.currentTurn.startedAt.toISOString(),
        },
        {
          id: `${turn.turnId}-assistant`,
          role: "assistant",
          text: this.redactText(payload.reply || ""),
          timestamp: convoTimestamp,
        }
      );

      if (payload.followUp) {
        this.conversation.push({
          id: `${turn.turnId}-followup`,
          role: "assistant",
          text: this.redactText(payload.followUp),
          timestamp: convoTimestamp,
        });
      }

      this.turns.push(turn);
      this.currentNodes = [];
      this.currentTurn = undefined;
    } catch (err) {
      console.error("SessionTraceCollector finishTurn failed", err);
    }
  }

  finalize() {
    try {
      const dump: SessionDump = {
        metadata: {
          sessionId: this.sessionId,
          startedAt: this.startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          modelId: this.modelId,
          redacted: this.redacted,
        },
        conversation: this.conversation,
        turns: this.turns,
        errors: this.errors,
        clientEvents: this.clientEvents,
      };

      this.store.merge(dump);
    } catch (err) {
      console.error("SessionTraceCollector finalize failed", err);
    }
  }

  private deriveSemanticModels(state: Record<string, unknown>): string[] {
    try {
      const fromMatches = ((state.matches as MatchingOutput | undefined)?.suggestions || []).map((s) => s.model);
      const fromOffers = ((state.offers as Offer[] | undefined) || []).map((o) => o.model).filter(Boolean);
      const combined = [...fromMatches, ...fromOffers];
      const seen = new Set<string>();
      return combined.filter((m) => {
        if (!m) return false;
        if (seen.has(m)) return false;
        seen.add(m);
        return true;
      });
    } catch (err) {
      console.error("SessionTraceCollector deriveSemanticModels failed", err);
      return [];
    }
  }
}

