import { StateGraph, START, END } from "@langchain/langgraph";
import {
  AgentLogEntry,
  ClientEvent,
  ConversationState,
  JeepModel,
  JeepValidationResult,
  UIRecoveryInstruction,
  UIState,
} from "../utils/types.js";
import { SessionTraceCollector } from "../utils/sessionDump.js";
import { findJeepModels } from "../utils/jeepCatalog.js";

export type GraphState = ConversationState & Record<string, unknown>;

const withLog = (state: GraphState, entry: AgentLogEntry) => ({
  debugLogs: [...(state.debugLogs || []), entry],
});

const normalizeBrand = (message: string) => {
  if (!message) return "";
  const lower = message.toLowerCase();
  if (lower.includes("jeep")) return "jeep";
  if (lower.includes("cherokee") || lower.includes("wrangler") || lower.includes("renegade")) return "jeep";
  return "";
};

const detectFrustration = (message: string) => {
  const lower = message.toLowerCase();
  const triggers = ["nervig", "frust", "funktioniert nicht", "geht nicht", "nichts zu sehen", "warum"];
  return triggers.some((t) => lower.includes(t));
};

const deriveIntent = (state: GraphState) => {
  const msg = state.userMessage || "";
  const brand = normalizeBrand(msg);
  const frustration = detectFrustration(msg);
  const wantsJeep = brand === "jeep";
  const isUiIssue = Boolean(state.uiState?.imageFailures) || msg.toLowerCase().includes("nichts");

  if (isUiIssue) {
    return { intent: "ui_mismatch", brand: brand || state.intent?.brand, segment: "suv", frustration } as any;
  }

  if (wantsJeep) {
    return { intent: "car_search", brand: "jeep", segment: "suv", frustration } as any;
  }

  if (!msg || msg.length < 6) {
    return { intent: "needs_clarification", brand: brand || "", segment: "suv", frustration } as any;
  }

  return { intent: "car_search", brand: brand || state.intent?.brand || "", segment: "suv", frustration } as any;
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

const buildRoute = (intent: string, brand: string, uiState: UIState) => {
  const jeepFocus = brand === "jeep";
  return {
    includeKnowledge: false,
    includeVisuals: false,
    includeMatching: false,
    includeOffers: true,
    strictOffers: true,
    retryMatching: false,
    jeepFocus,
    needsClarification: intent === "needs_clarification" || (!brand && intent !== "ui_mismatch"),
    runUiRecovery: intent === "ui_mismatch" || uiState.imageFailures > 0 || uiState.resultsNotVisible,
  } as any;
};

const jeepSearch = (): JeepModel[] => {
  return findJeepModels().map((entry) => ({
    id: entry.id,
    model: entry.model,
    year: entry.year,
    power: entry.power,
    drivetrain: entry.drivetrain,
    fuel: entry.fuel,
    summary: entry.summary,
    image: entry.image,
  }));
};

const validateJeepResults = (models: JeepModel[], uiState: UIState): JeepValidationResult => {
  const issues: string[] = [];
  let renderTextOnly = false;

  if (!models || models.length === 0) {
    issues.push("Keine Jeep-Modelle gefunden");
    renderTextOnly = true;
  }

  if (uiState.imageFailures > 0) {
    issues.push("Bilder laden nicht zuverlässig");
    renderTextOnly = true;
  }

  const validated = models.map((m) => ({
    ...m,
    imageOptional: true,
    fallbackReason: uiState.imageFailures > 0 ? "Bilder ausgefallen" : "",
  }));

  return { models: validated, issues, renderTextOnly };
};

const buildRecovery = (validation: JeepValidationResult, uiState: UIState): UIRecoveryInstruction => {
  const renderTextOnly = validation.renderTextOnly || uiState.imageFailures > 0;
  const showBanner = renderTextOnly || uiState.networkChanged || uiState.resultsNotVisible;
  const reasons = [] as string[];
  if (uiState.imageFailures > 0) reasons.push("Bilder fehlgeschlagen");
  if (uiState.networkChanged) reasons.push("Netzwerk geändert");
  if (uiState.resultsNotVisible) reasons.push("Ergebnisse nicht sichtbar");
  if (validation.issues.length > 0) reasons.push(...validation.issues);
  return {
    renderTextOnly,
    degradedMode: renderTextOnly,
    showBanner,
    reason: reasons.join("; ") || undefined,
    note: renderTextOnly ? "Zeige alle Jeep-Daten auch ohne Bilder." : undefined,
  };
};

const buildOffersFromJeep = (models: JeepModel[]) => {
  return models.map((m) => ({
    title: `${m.model} (${m.year})`,
    model: m.model,
    price: 0,
    dealer: "Jeep Direkt-Infos",
    link: "",
    image_url: m.image || "",
    location: "",
    mileage: "",
    badge: [m.power, m.drivetrain, m.fuel].filter(Boolean).join(" • "),
    created_at: new Date().toISOString(),
    vin: m.id,
    isOffroadRelevant: true,
    isExactMatchToSuggestion: true,
    relevanceScore: 1,
    source: "jeep-catalog",
    fallbackReason: m.fallbackReason || "",
  }));
};

const buildResponseText = (
  validation: JeepValidationResult,
  recovery: UIRecoveryInstruction,
  intentBrand: string,
  frustration: boolean,
) => {
  const lines: string[] = [];
  if (frustration || recovery.renderTextOnly) {
    lines.push("Ich sehe, das ist gerade frustrierend – die Bilder wollen nicht alle laden.");
  }
  if (recovery.renderTextOnly) {
    lines.push("Kein Stress: Ich gebe dir die Jeep-Infos sofort als Text, damit nichts verloren geht.");
  }
  if (intentBrand === "jeep" && validation.models.length > 0) {
    const highlights = validation.models
      .slice(0, 4)
      .map((m) => `${m.model} ${m.year}: ${m.power}, ${m.drivetrain}, ${m.fuel}. ${m.summary}`)
      .join(" \n");
    lines.push("Hier sind die wichtigsten Jeep-Modelle:");
    lines.push(highlights);
  } else if (validation.models.length === 0) {
    lines.push("Ich suche nach Jeep-Details, liefere dir aber direkt Text, falls Bilder fehlen.");
  }
  lines.push("Sag mir gerne noch Budget oder Einsatz (Stadt, Offroad, Familien), dann verfeinere ich.");
  return lines.join(" ").trim();
};

export const buildGraph = (collector?: SessionTraceCollector) => {
  const graph = new StateGraph<GraphState>({
    channels: {
      userMessage: null,
      history: null,
      intent: null,
      route: null,
      jeepResults: null,
      validatedJeepResults: null,
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

  graph.addNode("routerNode", async (state: GraphState) => {
    const route = buildRoute(state.intent?.intent || "unknown", state.intent?.brand || "", state.uiState || aggregateClientEvents());
    collector?.recordNode({ name: "router", input: { intent: state.intent, uiState: state.uiState } as Record<string, unknown>, output: route as unknown as Record<string, unknown> });
    return { route, ...withLog(state, { agent: "router", input: { intent: state.intent, uiState: state.uiState } as Record<string, unknown>, output: route as unknown as Record<string, unknown> }) };
  });

  graph.addNode("jeepSearchNode", async (state: GraphState) => {
    const route = state.route as any;
    if (!route?.jeepFocus) {
      collector?.recordNode({ name: "jeepSearch", input: {}, output: { skipped: true } });
      return { jeepResults: [] };
    }
    const results = jeepSearch();
    collector?.recordNode({ name: "jeepSearch", input: { brand: state.intent?.brand } as Record<string, unknown>, output: { models: results } as Record<string, unknown> });
    return { jeepResults: results, ...withLog(state, { agent: "jeepSearch", input: { brand: state.intent?.brand } as Record<string, unknown>, output: { models: results } as Record<string, unknown> }) };
  });

  graph.addNode("groundingAndValidationNode", async (state: GraphState) => {
    const validation = validateJeepResults((state.jeepResults as JeepModel[]) || [], state.uiState || aggregateClientEvents());
    collector?.recordNode({ name: "groundingAndValidation", input: { jeepResults: state.jeepResults, uiState: state.uiState } as Record<string, unknown>, output: validation as unknown as Record<string, unknown> });
    return { validatedJeepResults: validation, ...withLog(state, { agent: "groundingAndValidation", input: { jeepResults: state.jeepResults, uiState: state.uiState } as Record<string, unknown>, output: validation as unknown as Record<string, unknown> }) };
  });

  graph.addNode("errorRecoveryNodeUI", async (state: GraphState) => {
    const recovery = buildRecovery(state.validatedJeepResults as JeepValidationResult, state.uiState || aggregateClientEvents());
    collector?.recordNode({ name: "errorRecoveryUI", input: { validation: state.validatedJeepResults, uiState: state.uiState } as Record<string, unknown>, output: recovery as unknown as Record<string, unknown> });
    return { uiRecovery: recovery, ...withLog(state, { agent: "errorRecoveryUI", input: { validation: state.validatedJeepResults, uiState: state.uiState } as Record<string, unknown>, output: recovery as unknown as Record<string, unknown> }) };
  });

  graph.addNode("clarificationNode", async (state: GraphState) => {
    const route = state.route as any;
    if (!route?.needsClarification) {
      collector?.recordNode({ name: "clarification", input: {}, output: { skipped: true } });
      return {};
    }
    const reply = "Kurzer Check: Geht es dir um Jeep-Modelle? Teile Budget oder Einsatzgebiet (z.B. Stadt, Offroad).";
    collector?.recordNode({ name: "clarification", input: { intent: state.intent } as Record<string, unknown>, output: { reply } as Record<string, unknown> });
    return { response: { reply, followUp: "Ich helfe sofort, wenn du mehr Details gibst." }, content: { offers: [], visuals: [], definition: "" } };
  });

  graph.addNode("responseNode", async (state: GraphState) => {
    const validation = (state.validatedJeepResults as JeepValidationResult) || { models: [], issues: [], renderTextOnly: false };
    const recovery = (state.uiRecovery as UIRecoveryInstruction) || { renderTextOnly: false, degradedMode: false, showBanner: false };
    const reply = buildResponseText(validation, recovery, state.intent?.brand || "", Boolean(state.intent?.frustration));
    const offers = buildOffersFromJeep(validation.models || []);
    const content = {
      offers,
      visuals: recovery.renderTextOnly ? [] : offers.map((o) => o.image_url).filter(Boolean).slice(0, 6),
      definition: "Jeep-Schnellüberblick",
      offerDiagnostics: {
        queryModels: offers.map((o) => o.model),
        offroadRequired: true,
        fallbackUsed: recovery.renderTextOnly,
        noRelevantOffers: offers.length === 0,
        strategy: recovery.renderTextOnly ? "text-only" : "standard",
        failureCount: (state.uiState?.imageFailures || 0),
        relevance: offers.map((o) => ({ model: o.model, isOffroadRelevant: true, isExactMatchToSuggestion: true, relevanceScore: 1 })),
      },
    };
    collector?.recordNode({ name: "response", input: { validation, recovery } as Record<string, unknown>, output: { reply, followUp: "" } as Record<string, unknown> });
    return {
      response: { reply, followUp: recovery.renderTextOnly ? "Ich bleibe im Textmodus, bis die Bilder wieder laufen." : "" },
      content,
      ...withLog(state, { agent: "response", input: { validation, recovery } as Record<string, unknown>, output: { reply, followUp: "" } as Record<string, unknown> }),
    };
  });

  graph.addEdge(START, "clientEventNode" as any);
  graph.addEdge("clientEventNode" as any, "intentParserNode" as any);
  graph.addEdge("intentParserNode" as any, "routerNode" as any);
  graph.addEdge("routerNode" as any, "jeepSearchNode" as any);
  graph.addEdge("jeepSearchNode" as any, "groundingAndValidationNode" as any);
  graph.addEdge("groundingAndValidationNode" as any, "errorRecoveryNodeUI" as any);
  graph.addEdge("errorRecoveryNodeUI" as any, "clarificationNode" as any);
  graph.addEdge("clarificationNode" as any, "responseNode" as any);
  graph.addEdge("responseNode" as any, END);

  return graph.compile();
};
