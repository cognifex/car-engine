import { StateGraph, START, END } from "@langchain/langgraph";
import {
  AgentLogEntry,
  ClientEvent,
  ConversationState,
  UIRecoveryInstruction,
  UIState,
  ContentState,
  UIHealth,
} from "../utils/types.js";
import { SessionTraceCollector } from "../utils/sessionDump.js";
import { findJeepModels } from "../utils/jeepCatalog.js";
import { evaluateUiHealth } from "../policies/uiHealthPolicy.js";
import { evaluateRouting } from "../policies/routingPolicy.js";

export type GraphState = ConversationState & Record<string, unknown>;

const withLog = (state: GraphState, entry: AgentLogEntry) => ({
  debugLogs: [...(state.debugLogs || []), entry],
});

const deriveIntent = (state: GraphState) => {
  const msg = state.userMessage || "";
  const frustration = /nervig|frust|funktioniert nicht|geht nicht|nichts zu sehen|warum/i.test(msg);
  const needsClarification = !msg || msg.trim().length < 6;

  return {
    intent: needsClarification ? "needs_clarification" : "informational",
    frustration,
  } as any;
};

const aggregateClientEvents = (events: ClientEvent[] = []): UIState => {
  const failed = events.filter((e) => e.type === "IMAGE_LOAD_FAILED");
  const net = events.some((e) => e.type === "NETWORK_CHANGED");
  const invisible = events.some((e) => e.type === "RESULTS_NOT_VISIBLE");
  const last = events.length > 0 ? events[events.length - 1] : undefined;
  return {
    imageFailures: failed.length,
    failedModels: failed.map((e) => String(e.meta?.model || e.meta?.modelId || "")).filter(Boolean),
    networkChanged: net,
    resultsNotVisible: invisible,
    lastEventAt: last?.at,
  };
};

const loadDemoEntities = () => {
  return findJeepModels().map((entry) => ({
    id: entry.id,
    title: entry.model,
    year: entry.year,
    summary: entry.summary,
    attributes: [entry.power, entry.drivetrain, entry.fuel].filter(Boolean),
    image: entry.image,
  }));
};

const buildOffersFromEntities = (entities: Record<string, unknown>[]) => {
  return entities.map((m) => ({
    title: String(m.title || "Ergebnis"),
    model: String(m.title || "Ergebnis"),
    price: 0,
    dealer: "Datenquelle",
    link: "",
    image_url: String(m.image || ""),
    location: "",
    mileage: "",
    badge: Array.isArray(m.attributes) ? (m.attributes as string[]).filter(Boolean).join(" • ") : "",
    created_at: new Date().toISOString(),
    vin: String(m.id || ""),
    isOffroadRelevant: false,
    isExactMatchToSuggestion: true,
    relevanceScore: 1,
    source: "generic-catalog",
    fallbackReason: "",
  }));
};

const buildRecovery = (uiHealth: UIHealth): UIRecoveryInstruction => {
  return {
    renderTextOnly: uiHealth.render_text_only,
    degradedMode: uiHealth.degraded_mode,
    showBanner: uiHealth.show_banner,
    reason: uiHealth.reason,
    note: uiHealth.note,
  };
};

const buildResponseText = (content_state: ContentState, uiHealth: UIHealth, frustration: boolean) => {
  const lines: string[] = [];
  if (frustration && uiHealth.degraded_mode) {
    lines.push("Ich sehe Störungen – ich halte die Darstellung stabil und bleibe bei Text.");
  }
  if (!content_state.has_results) {
    lines.push("Keine Ergebnisse gefunden, ich bleibe in einem stabilen Textmodus.");
  } else {
    lines.push(`Ich habe ${content_state.num_results} Ergebnisse zusammengestellt.`);
  }
  if (content_state.clarification_required) {
    lines.push("Gib mir bitte noch Kontext oder Parameter, damit ich präziser werden kann.");
  }
  if (uiHealth.render_text_only) {
    lines.push("Visuelle Elemente sind reduziert, bis die UI wieder stabil ist.");
  }
  return lines.join(" ").trim();
};

export const buildGraph = (collector?: SessionTraceCollector) => {
  const graph = new StateGraph<GraphState>({
    channels: {
      userMessage: null,
      history: null,
      intent: null,
      route: null,
      entities: null,
      offers: null,
      content_state: null,
      ui_health: null,
      uiState: null,
      clientEvents: null,
      uiRecovery: null,
      content: null,
      response: null,
      debugLogs: null,
    },
  });

  graph.addNode("clientEventNode", async (state: GraphState) => {
    const events = state.clientEvents || [];
    const uiState = aggregateClientEvents(events as ClientEvent[]);
    collector?.recordNode({ name: "clientEvent", input: { events } as Record<string, unknown>, output: uiState as unknown as Record<string, unknown> });
    return { uiState, ...withLog(state, { agent: "clientEvent", input: { events } as Record<string, unknown>, output: uiState as unknown as Record<string, unknown> }) };
  });

  graph.addNode("intentParserNode", async (state: GraphState) => {
    const intent = deriveIntent(state);
    collector?.recordNode({ name: "intentParser", input: { message: state.userMessage, uiState: state.uiState } as Record<string, unknown>, output: intent as Record<string, unknown> });
    return { intent, ...withLog(state, { agent: "intentParser", input: { message: state.userMessage, uiState: state.uiState } as Record<string, unknown>, output: intent as Record<string, unknown> }) };
  });

  graph.addNode("entityFetchNode", async (state: GraphState) => {
    const entities = loadDemoEntities();
    collector?.recordNode({ name: "entityFetch", input: {}, output: { entities } as Record<string, unknown> });
    return { entities, ...withLog(state, { agent: "entityFetch", input: {}, output: { entities } as Record<string, unknown> }) };
  });

  graph.addNode("routingNode", async (state: GraphState) => {
    const needsClarification = state.intent?.intent === "needs_clarification";
    const offers = buildOffersFromEntities(state.entities || []);
    const decision = evaluateRouting(
      {
        intent: state.intent as any,
        offerCount: offers.length,
        needsClarification,
      },
      undefined,
    );
    collector?.recordNode({ name: "routing", input: { intent: state.intent, offers: offers.length } as Record<string, unknown>, output: decision as unknown as Record<string, unknown> });
    return {
      route: decision.route,
      content_state: decision.content_state,
      offers,
      ...withLog(state, { agent: "routing", input: { intent: state.intent, offers: offers.length } as Record<string, unknown>, output: decision as unknown as Record<string, unknown> }),
    };
  });

  graph.addNode("uiHealthPolicyNode", async (state: GraphState) => {
    const uiHealth = evaluateUiHealth(
      {
        uiState: state.uiState as UIState,
        clientEvents: state.clientEvents as ClientEvent[],
        agentFailures: 0,
      },
      undefined,
    );
    const uiRecovery = buildRecovery(uiHealth);
    collector?.recordNode({ name: "uiHealth", input: { uiState: state.uiState, events: state.clientEvents } as Record<string, unknown>, output: uiHealth as unknown as Record<string, unknown> });
    return {
      ui_health: uiHealth,
      uiRecovery,
      ...withLog(state, { agent: "uiHealth", input: { uiState: state.uiState, events: state.clientEvents } as Record<string, unknown>, output: uiHealth as unknown as Record<string, unknown> }),
    };
  });

  graph.addNode("clarificationNode", async (state: GraphState) => {
    if (!state.content_state?.clarification_required) {
      collector?.recordNode({ name: "clarification", input: {}, output: { skipped: true } });
      return {};
    }
    const reply = "Kurzer Check: Bitte gib mir noch Parameter oder Kontext, damit ich präziser liefern kann.";
    collector?.recordNode({ name: "clarification", input: { intent: state.intent } as Record<string, unknown>, output: { reply } as Record<string, unknown> });
    return { response: { reply, followUp: "Sobald du ergänzt, gehe ich in den Normalmodus zurück." }, content: { offers: [], visuals: [], definition: "" } };
  });

  graph.addNode("responseNode", async (state: GraphState) => {
    const uiHealth = (state.ui_health as UIHealth) || { degraded_mode: false, render_text_only: false, show_banner: false };
    const content_state = (state.content_state as ContentState) || {
      has_results: false,
      num_results: 0,
      clarification_required: false,
      no_relevant_results: true,
      fallback_used: false,
      strict_matching: false,
    };
    const offers = (state.offers as any[]) || [];
    const reply = buildResponseText(content_state, uiHealth, Boolean(state.intent?.frustration));
    const content = {
      offers,
      visuals: uiHealth.render_text_only ? [] : offers.map((o) => o.image_url).filter(Boolean).slice(0, 6),
      definition: "Generische Übersicht",
    };
    collector?.recordNode({ name: "response", input: { content_state, uiHealth } as Record<string, unknown>, output: { reply, followUp: "" } as Record<string, unknown> });
    return {
      response: { reply, followUp: uiHealth.render_text_only ? "Visuelle Elemente sind vorübergehend deaktiviert." : "" },
      content,
      content_state,
      ui_health: uiHealth,
      ...withLog(state, { agent: "response", input: { content_state, uiHealth } as Record<string, unknown>, output: { reply, followUp: "" } as Record<string, unknown> }),
    };
  });

  graph.addEdge(START, "clientEventNode" as any);
  graph.addEdge("clientEventNode" as any, "intentParserNode" as any);
  graph.addEdge("intentParserNode" as any, "entityFetchNode" as any);
  graph.addEdge("entityFetchNode" as any, "routingNode" as any);
  graph.addEdge("routingNode" as any, "uiHealthPolicyNode" as any);
  graph.addEdge("uiHealthPolicyNode" as any, "clarificationNode" as any);
  graph.addEdge("clarificationNode" as any, "responseNode" as any);
  graph.addEdge("responseNode" as any, END);

  return graph.compile();
};
