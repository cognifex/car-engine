import { logger } from "../utils/logger.js";
import { ConversationState, ConversationMessage, ClientEvent } from "../utils/types.js";
import { SessionTraceCollector, SessionDumpStore } from "../utils/sessionDump.js";
import { buildGraph } from "./graph.js";

export const runPipeline = async (
  userMessage: string,
  history: ConversationMessage[] = [],
  options: { sessionId?: string; redacted?: boolean; clientEvents?: ClientEvent[]; preferenceState?: Record<string, unknown>; offersHistory?: any[] } = {},
): Promise<ConversationState> => {
  const sessionId = options.sessionId || `sess-${Date.now()}`;
  const collector = new SessionTraceCollector({
    sessionId,
    modelId: "graph-catalog",
    redacted: options.redacted,
    store: new SessionDumpStore(),
  });

  const graph = buildGraph(collector);

  const initialState: ConversationState = {
    userMessage,
    history,
    debugLogs: [],
    clientEvents: options.clientEvents || [],
    preferenceState: options.preferenceState as any,
    offersHistory: options.offersHistory as any,
  };

  logger.info({ userMessage, sessionId }, "Starting AutoMatch AI graph run");
  collector.startTurn({ userMessage, history, clientEvents: options.clientEvents || [] });
  const result = await graph.invoke(initialState as any);
  const merged: ConversationState = { ...initialState, ...(result as Record<string, unknown>) } as ConversationState;
  collector.finishTurn({ reply: merged.response?.reply || "", followUp: merged.response?.followUp || "", state: merged });
  collector.finalize();
  logger.info({ response: merged.response, sessionId }, "Finished graph run");
  return { ...merged, sessionId } as ConversationState;
};
