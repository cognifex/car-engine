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
import { evaluateUiHealth } from "../policies/uiHealthPolicy.js";
import { evaluateRouting } from "../policies/routingPolicy.js";
import { loadSpecs } from "../utils/specs.js";
import {
  INTENT_TYPES,
  OffersHistory,
  PreferenceConstraintState,
  PreferenceConstraintStateData,
  applyPreferencesToItems,
  detectIntent,
  needsEntities,
  isSearchIntent,
  hasStructuredProductRequirement,
} from "../utils/preferences.js";
import { loadReflectionSummary, recordReflection } from "../utils/reflection.js";

export type GraphState = ConversationState &
  Record<string, unknown> & {
    preferenceState?: PreferenceConstraintStateData;
    offersHistory?: { timestamp: string; items: string[]; intentType?: string; preferenceState: PreferenceConstraintStateData }[];
    conversationPlan?: string;
    gatingReason?: string;
    lastReply?: string;
  };

const withLog = (state: GraphState, entry: AgentLogEntry) => ({
  debugLogs: [...(state.debugLogs || []), entry],
});

const deriveIntent = (state: GraphState) => {
  const msg = state.userMessage || "";
  const parsed = detectIntent(msg);
  return {
    intent: parsed.intent,
    frustration: Boolean(parsed.frustration),
    preferenceSignals: parsed.preferenceSignals,
    confidence: parsed.confidence,
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

const normalize = (val?: string) => (val || "").toLowerCase();

const scoreSpec = (spec: ReturnType<typeof loadSpecs>[number], preferenceState?: PreferenceConstraintStateData) => {
  const product = preferenceState?.product || { preferredCategories: [], excludedCategories: [], useCases: [] };
  let score = 0;
  const normBrand = normalize(spec.brand);
  const normModel = normalize(spec.model);
  const normBody = normalize(spec.bodyType);
  const normDrive = normalize(spec.drivetrain);
  const normFuel = normalize(spec.fuel);

  if (spec.image) score += 0.5;

  const preferred = (product.preferredCategories || []).map(normalize);
  if (preferred.some((c) => normBrand.includes(c) || normModel.includes(c) || normBody.includes(c))) {
    score += 3;
  }

  const useCases = (product.useCases || []).map(normalize);
  if (useCases.some((u) => ["gelände", "offroad"].includes(u))) {
    if (normDrive.includes("4x4") || normDrive.includes("awd") || normDrive.includes("allrad") || normBody.includes("suv") || normBody.includes("pickup")) {
      score += 3;
    } else {
      score += 1;
    }
  }
  if (useCases.some((u) => ["stadt", "stadtverkehr", "kurzstrecke"].includes(u))) {
    if (normBody.includes("hatch") || normBody.includes("compact") || normBody.includes("city") || normFuel.includes("elektro")) {
      score += 2;
    } else {
      score += 1;
    }
  }
  if (useCases.some((u) => ["langstrecke"].includes(u))) {
    if (normBody.includes("kombi") || normBody.includes("wagon") || normBody.includes("touring") || normBody.includes("suv")) {
      score += 2;
    }
    if (normFuel.includes("diesel") || normFuel.includes("hybrid")) score += 1;
  }

  return score;
};

const loadCatalogEntities = (preferenceState?: PreferenceConstraintStateData, max = 12) => {
  const specs = loadSpecs().filter((s) => s.brand && s.model);
  const excluded = new Set((preferenceState?.product?.excludedCategories || []).map(normalize));
  const step = Math.max(1, Math.floor(specs.length / 1500));
  const sampled = specs.filter((_, idx) => idx % step === 0);

  const ranked = sampled
    .filter((spec) => {
      const normBrand = normalize(spec.brand);
      const normModel = normalize(spec.model);
      const normBody = normalize(spec.bodyType);
      return (
        !excluded.has(normBrand) &&
        !excluded.has(normModel) &&
        !excluded.has(normBody) &&
        !Array.from(excluded).some((ex) => normModel.includes(ex) || normBrand.includes(ex))
      );
    })
    .map((spec) => ({
      id: `${spec.brand}-${spec.model}-${spec.year || ""}`.replace(/\s+/g, "-").toLowerCase(),
      title: `${spec.brand} ${spec.model}`,
      category: spec.bodyType || spec.drivetrain || spec.fuel || "Fahrzeug",
      year: spec.year,
      summary: spec.bodyType
        ? `${spec.bodyType}${spec.drivetrain ? " • " + spec.drivetrain : ""}`
        : "Katalogmodell",
      attributes: [
        spec.bodyType,
        spec.drivetrain,
        spec.fuel,
        spec.transmission,
        spec.enginePowerKw ? `${spec.enginePowerKw} kW` : "",
      ].filter(Boolean),
      image: spec.image,
      link: spec.url,
      brand: spec.brand,
      _score: scoreSpec(spec, preferenceState),
    }))
    .sort((a, b) => (b._score || 0) - (a._score || 0));

  return ranked.slice(0, max).map(({ _score, ...rest }) => rest);
};

const buildOffersFromEntities = (entities: Record<string, unknown>[]) => {
  return entities.map((m) => ({
    title: String(m.title || "Ergebnis"),
    model: String(m.title || "Ergebnis"),
    price: 0,
    dealer: "Katalog",
    link: String((m as any).link || ""),
    image_url: String(m.image || ""),
    location: "",
    mileage: "",
    badge: Array.isArray(m.attributes) ? (m.attributes as string[]).filter(Boolean).join(" • ") : "",
    created_at: new Date().toISOString(),
    vin: String(m.id || ""),
    isOffroadRelevant: Boolean((m as any).category && normalize((m as any).category).includes("suv")),
    isExactMatchToSuggestion: true,
    relevanceScore: 1,
    source: "spec-catalog",
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

const buildPlanHint = ({
  intentType,
  allowOffers,
  structured,
  preferenceState,
}: {
  intentType?: string;
  allowOffers: boolean;
  structured: boolean;
  preferenceState?: PreferenceConstraintStateData;
}) => {
  if (allowOffers) {
    return "Plan: Ergebnisse kurz anreißen, dann auf Wunsch vertiefen.";
  }
  if (!structured) {
    return "Plan: Zwei schnelle Fragen (Nutzung, Budget) klären, dann Treffer zeigen.";
  }
  if (intentType === INTENT_TYPES.KNOWLEDGE_SIGNAL || intentType === INTENT_TYPES.MODE_REQUEST || intentType === INTENT_TYPES.META_COMMUNICATION) {
    return "Plan: Geführtes Onboarding mit Rückfragen, bevor wir Angebote laden.";
  }
  const categories = (preferenceState?.product?.preferredCategories || []).slice(0, 2).join(", ");
  return categories
    ? `Plan: Kurz bestätigen (${categories}) und danach Treffer zeigen.`
    : "Plan: Gespräch fokussieren, dann Ergebnisse liefern.";
};

const buildResponseText = (
  content_state: ContentState & { repeat_with_changed_constraints?: boolean },
  uiHealth: UIHealth,
  frustration: boolean,
  planHint?: string,
  lastUserMessage?: string,
) => {
  const lines: string[] = [];
  if (frustration) {
    lines.push("Sorry für die Reibung – ich halte es kurz und stabil.");
  }
  if (content_state.repeat_with_changed_constraints) {
    lines.push("Die neuen Filter liefern dieselben Ergebnisse. Magst du die Kriterien anpassen?");
  } else if (!content_state.has_results || content_state.no_relevant_results) {
    lines.push("Noch keine passenden Ergebnisse. Lass uns die Kriterien kurz schärfen.");
  } else {
    lines.push(`Ich habe ${content_state.num_results} Ergebnisse vorbereitet.`);
  }
  if (planHint) {
    lines.push(planHint);
  }
  if (content_state.clarification_required) {
    lines.push("Wenn du willst, stelle ich gezielt 2-3 Fragen und gehe dann in die Liste.");
  }
  if (uiHealth.render_text_only) {
    lines.push("Visuelle Elemente sind reduziert, bis die UI stabil ist.");
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
      preferenceState: null,
      offersHistory: null,
      conversationPlan: null,
      gatingReason: null,
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

  graph.addNode("preferenceStateNode", async (state: GraphState) => {
    const manager = new PreferenceConstraintState(state.preferenceState);
    const updated = manager.updateFromIntent(state.intent as any);
    collector?.recordNode({
      name: "preferenceState",
      input: { intent: state.intent } as Record<string, unknown>,
      output: { preferenceState: updated } as Record<string, unknown>,
    });
    return {
      preferenceState: manager.getState(),
      ...withLog(state, {
        agent: "preferenceState",
        input: { intent: state.intent } as Record<string, unknown>,
        output: { preferenceState: updated } as Record<string, unknown>,
      }),
    };
  });

  graph.addNode("entityFetchNode", async (state: GraphState) => {
    const entities = loadCatalogEntities(state.preferenceState as PreferenceConstraintStateData, 18);
    const preferenceState = state.preferenceState as PreferenceConstraintStateData;
    const filteredEntities = needsEntities((state.intent as any)?.intent, preferenceState)
      ? applyPreferencesToItems(entities, preferenceState).slice(0, 12)
      : [];
    collector?.recordNode({ name: "entityFetch", input: { preferenceState } as Record<string, unknown>, output: { entities: filteredEntities } as Record<string, unknown> });
    return { entities: filteredEntities, ...withLog(state, { agent: "entityFetch", input: { preferenceState } as Record<string, unknown>, output: { entities: filteredEntities } as Record<string, unknown> }) };
  });

  graph.addNode("routingNode", async (state: GraphState) => {
    const intentType = (state.intent as any)?.intent;
    const preferenceState = state.preferenceState as PreferenceConstraintStateData;
    const structured = hasStructuredProductRequirement(preferenceState);
    const searchIntent = isSearchIntent(intentType);
    const metaIntent =
      intentType === INTENT_TYPES.META_COMMUNICATION ||
      intentType === INTENT_TYPES.KNOWLEDGE_SIGNAL ||
      intentType === INTENT_TYPES.MODE_REQUEST ||
      intentType === INTENT_TYPES.NEEDS_CLARIFICATION ||
      intentType === INTENT_TYPES.AFFIRMATION;
    const allowOffers = searchIntent && structured && !metaIntent;
    const needsClarification = !allowOffers;

    const entityList = Array.isArray(state.entities) ? (state.entities as Record<string, unknown>[]) : [];
    const offers = allowOffers ? buildOffersFromEntities(entityList) : [];
    const history = new OffersHistory(state.offersHistory as any);
    const repeatWithChangedConstraints = history.detectRepeatWithChanges(offers, state.intent as any, (state.preferenceState || {}) as PreferenceConstraintStateData);
    const decision = evaluateRouting(
      {
        intent: state.intent as any,
        offerCount: offers.length,
        needsClarification,
        repeatWithChangedConstraints,
        allowOffers,
      },
      undefined,
    );
    if (!allowOffers) {
      recordReflection({
        reason: metaIntent ? "user_requested_guidance" : structured ? "missing_search_intent" : "missing_requirements",
        intent: intentType,
        gatingReason: metaIntent ? "guidance" : structured ? "intent" : "requirements",
      });
    }
    if (repeatWithChangedConstraints) {
      recordReflection({ reason: "repeat_with_changed_constraints", intent: intentType, gatingReason: "repeat" });
    }
    const filteredOffers = repeatWithChangedConstraints ? [] : offers;
    const planHint = buildPlanHint({ intentType, allowOffers, structured, preferenceState });
    const content_state: ContentState = {
      ...decision.content_state,
      has_results: filteredOffers.length > 0,
      num_results: filteredOffers.length,
      repeat_with_changed_constraints: repeatWithChangedConstraints,
      fallback_used: decision.content_state.fallback_used || repeatWithChangedConstraints || filteredOffers.length === 0,
      no_relevant_results: decision.content_state.no_relevant_results || filteredOffers.length === 0,
    } as any;
    if (repeatWithChangedConstraints && content_state.notes) {
      content_state.notes.push("Detected identical offers after intent/state change.");
    }
    collector?.recordNode({ name: "routing", input: { intent: state.intent, offers: offers.length } as Record<string, unknown>, output: decision as unknown as Record<string, unknown> });
    return {
      route: decision.route,
      content_state,
      offers: filteredOffers,
      repeat_with_changed_constraints: repeatWithChangedConstraints,
      conversationPlan: planHint,
      gatingReason: allowOffers ? undefined : structured ? "waiting_for_explicit_search_intent" : "needs_structured_requirement",
      ...withLog(state, { agent: "routing", input: { intent: state.intent, offers: offers.length } as Record<string, unknown>, output: { decision, repeatWithChangedConstraints, allowOffers, structured } as unknown as Record<string, unknown> }),
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
    const reply = "Lass uns kurz klären: Nennung von Nutzung (Stadt/Langstrecke/Gelände) und grobes Budget reichen, dann starte ich direkt.";
    collector?.recordNode({ name: "clarification", input: { intent: state.intent } as Record<string, unknown>, output: { reply } as Record<string, unknown> });
    return { response: { reply, followUp: "Gib mir Nutzung + Budget, dann zeige ich sofort passende Beispiele." }, content: { offers: [], visuals: [], definition: "" } };
  });

  graph.addNode("responseNode", async (state: GraphState) => {
    const uiHealth = (state.ui_health as UIHealth) || { degraded_mode: false, render_text_only: false, show_banner: false };
    const content_state = (state.content_state as ContentState & { repeat_with_changed_constraints?: boolean }) || {
      has_results: false,
      num_results: 0,
      clarification_required: false,
      no_relevant_results: true,
      fallback_used: false,
      strict_matching: false,
    };
    const offers = (state.offers as any[]) || [];
    const history = new OffersHistory(state.offersHistory as any);
    history.record({
      items: offers,
      intentType: (state.intent as any)?.intent,
      preferenceState:
        (state.preferenceState as PreferenceConstraintStateData) || {
          product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] },
          conversation: {},
          style: {},
        },
    });
    const offersHistory = history.snapshot();
    const planHint = state.conversationPlan as string | undefined;
    const reflectionSummary = loadReflectionSummary();
    let reply = buildResponseText(
      content_state,
      uiHealth,
      Boolean(state.intent?.frustration),
      planHint || reflectionSummary,
      state.userMessage as string,
    );
    if (state.lastReply && reply === state.lastReply) {
      reply = `${reply} Lass uns diesmal einen anderen Ansatz wählen: Ich stelle dir zwei präzise Fragen oder schlage Alternativen vor.`;
    }
    if (!content_state.has_results || content_state.no_relevant_results || content_state.clarification_required) {
      const questions = [];
      if (!(state.preferenceState as PreferenceConstraintStateData)?.product?.useCases?.length) {
        questions.push("Wofür nutzt du das Fahrzeug am meisten (Stadt, Langstrecke, Gelände)?");
      }
      if (!(state.preferenceState as PreferenceConstraintStateData)?.product?.budget) {
        questions.push("Gibt es ein Budget, das ich berücksichtigen soll?");
      }
      if (questions.length) {
        reply = `${reply} ${questions.slice(0, 2).join(" ")}`;
      }
    }
    const content = {
      offers,
      visuals: uiHealth.render_text_only ? [] : offers.map((o) => o.image_url).filter(Boolean).slice(0, 6),
      definition: "Generische Übersicht",
    };
    collector?.recordNode({ name: "response", input: { content_state, uiHealth } as Record<string, unknown>, output: { reply, followUp: "" } as Record<string, unknown> });
    return {
      response: { reply, followUp: uiHealth.render_text_only ? "Visuelle Elemente sind vorübergehend deaktiviert." : "" },
      content,
      offersHistory,
      content_state,
      ui_health: uiHealth,
      lastReply: reply,
      ...withLog(state, { agent: "response", input: { content_state, uiHealth } as Record<string, unknown>, output: { reply, followUp: "" } as Record<string, unknown> }),
    };
  });

  graph.addEdge(START, "clientEventNode" as any);
  graph.addEdge("clientEventNode" as any, "intentParserNode" as any);
  graph.addEdge("intentParserNode" as any, "preferenceStateNode" as any);
  graph.addEdge("preferenceStateNode" as any, "entityFetchNode" as any);
  graph.addEdge("entityFetchNode" as any, "routingNode" as any);
  graph.addEdge("routingNode" as any, "uiHealthPolicyNode" as any);
  graph.addEdge("uiHealthPolicyNode" as any, "clarificationNode" as any);
  graph.addEdge("clarificationNode" as any, "responseNode" as any);
  graph.addEdge("responseNode" as any, END);

  return graph.compile();
};
