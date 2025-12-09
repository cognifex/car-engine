import { StateGraph, START, END } from "@langchain/langgraph";
import {
  AgentLogEntry,
  ClientEvent,
  ConversationMessage,
  ConversationState,
  UIRecoveryInstruction,
  UIState,
  ContentState,
  UIHealth,
  PlanStep,
  TurnEvaluation,
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
import { friendlyPersona, applyPersonaTone } from "../ux/persona.js";
import { detectFrustrationSignals } from "../ux/frustration.js";
import { MemoryManager, mergeMemory, SessionMemorySnapshot, ShortTermMemoryWindow } from "../memory/memory.js";

export type GraphState = ConversationState &
  Record<string, unknown> & {
    preferenceState?: PreferenceConstraintStateData;
    offersHistory?: { timestamp: string; items: string[]; intentType?: string; preferenceState: PreferenceConstraintStateData }[];
    conversationPlan?: string;
    gatingReason?: string;
    lastReply?: string;
    memoryManager?: MemoryManager;
    memorySnapshot?: SessionMemorySnapshot;
    planMeta?: PlannerDecision;
  };

type PlannerDecision = {
  plan: PlanStep[];
  allowOffers: boolean;
  needsClarification: boolean;
  structured: boolean;
  planHint?: string;
};

const withLog = (state: GraphState, entry: AgentLogEntry) => ({
  debugLogs: [...(state.debugLogs || []), entry],
});

const deriveIntent = (state: GraphState) => {
  const msg = state.userMessage || "";
  const parsed = detectIntent(msg);
  return {
    intent: parsed.intent,
    frustration: parsed.frustration,
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

const buildPlannerDecision = (state: GraphState): PlannerDecision => {
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
  const needsClarification = !structured || intentType === INTENT_TYPES.NEEDS_CLARIFICATION;

  const plan: PlanStep[] = [
    { id: "intent-parse", description: "Verstehe Absicht und Stimmung", agent: "intent", required: true },
    { id: "planner", description: "Bestimme die nächsten Schritte und UX-Modus", agent: "planner", required: true },
  ];
  if (needsClarification) {
    plan.push({ id: "profile", description: "Sammle Nutzung, Budget und Stilpräferenzen", agent: "profile", required: true });
  }
  if (allowOffers) {
    plan.push({ id: "tooling", description: "Generiere/Filtern Angebote und Visuals", agent: "tool", required: true });
  }
  plan.push({ id: "evaluator", description: "Qualität/UX/Frust prüfen", agent: "evaluator", required: true });
  plan.push({ id: "front", description: "Antwort im freundlichen Ton liefern", agent: "front", required: true });

  const planHint = buildPlanHint({ intentType, allowOffers, structured, preferenceState });

  return { plan, allowOffers, needsClarification, structured, planHint };
};

const defaultContentState = (): ContentState & { repeat_with_changed_constraints?: boolean } => ({
  has_results: false,
  num_results: 0,
  clarification_required: false,
  no_relevant_results: true,
  fallback_used: false,
  strict_matching: false,
  notes: [],
  repeat_with_changed_constraints: false,
});

const summarizeEvaluation = (
  content_state: ContentState & { repeat_with_changed_constraints?: boolean },
  uiHealth: UIHealth,
  frustration: boolean,
): TurnEvaluation => {
  const notes: string[] = [];
  const blockers: string[] = [];

  if (content_state.repeat_with_changed_constraints) {
    notes.push("Identische Ergebnisse trotz neuer Filter");
  }
  if (!content_state.has_results || content_state.no_relevant_results) {
    notes.push("Keine passenden Ergebnisse – fokussiere Kriterien");
  }
  if (uiHealth.render_text_only) {
    notes.push("UI instabil, Text-Only aktiviert");
  }
  if (uiHealth.error) {
    blockers.push(uiHealth.error);
  }
  if (frustration) {
    notes.push("Frustration erkannt");
  }

  const severity: TurnEvaluation["severity"] =
    blockers.length > 0 ? "error" : content_state.fallback_used || uiHealth.degraded_mode || frustration ? "warn" : "info";

  const followUp = content_state.clarification_required
    ? "Gib mir bitte kurz Nutzung (z. B. Stadt/Langstrecke) und Budget, dann zeige ich sofort passende Beispiele."
    : undefined;

  return { severity, notes, blockers, followUp };
};

const composeReply = ({
  content_state,
  uiHealth,
  planHint,
  frustration,
  evaluation,
  lastReply,
}: {
  content_state: ContentState & { repeat_with_changed_constraints?: boolean };
  uiHealth: UIHealth;
  planHint?: string;
  frustration: boolean;
  evaluation?: TurnEvaluation;
  lastReply?: string;
}) => {
  let base = "";
  if (content_state.repeat_with_changed_constraints) {
    base = "Die neuen Filter liefern dieselben Ergebnisse. Magst du die Kriterien anpassen?";
  } else if (!content_state.has_results || content_state.no_relevant_results) {
    base = "Noch nichts Passendes. Lass uns die Kriterien kurz schärfen.";
  } else {
    base = `Ich habe ${content_state.num_results} Optionen vorbereitet.`;
  }

  if (evaluation?.severity === "error") {
    base = "Ich pausiere kurz, bis die UI stabil ist oder ich mehr Signale habe.";
  }

  const reply = applyPersonaTone(base, friendlyPersona, { frustration, planHint });
  const followUp = uiHealth.render_text_only
    ? "Visuelle Elemente reduziere ich, bis die UI stabil ist."
    : evaluation?.followUp || "";

  if (lastReply && reply === lastReply) {
    return {
      reply: `${reply} Lass uns diesmal einen anderen Ansatz wählen: zwei gezielte Fragen oder alternative Modelle?`,
      followUp,
    };
  }

  return { reply, followUp };
};

const updateOffersHistory = (
  offers: any[],
  intent: { intent?: string },
  preferenceState: PreferenceConstraintStateData,
  history?: OffersHistory,
) => {
  const tracker = history || new OffersHistory();
  tracker.record({ items: offers, intentType: intent.intent, preferenceState });
  return tracker.snapshot();
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
      plan: null,
      evaluation: null,
      memorySnapshot: null,
      memoryManager: null,
      planMeta: null,
    },
  });

  graph.addNode("memoryBootstrapNode", async (state: GraphState) => {
    const merged = mergeMemory(state.memorySnapshot as SessionMemorySnapshot | undefined, state.history as ConversationMessage[]);
    collector?.recordNode({ name: "memoryBootstrap", input: { history: state.history } as Record<string, unknown>, output: merged as unknown as Record<string, unknown> });
    return {
      memorySnapshot: merged,
      preferenceState: merged.working,
      history: state.history && (state.history as ConversationMessage[]).length ? state.history : merged.shortTerm.messages,
      ...withLog(state, { agent: "memoryBootstrap", input: { history: state.history || [] }, output: { working: merged.working } }),
    };
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

  graph.addNode("plannerNode", async (state: GraphState) => {
    const prefPreview = new PreferenceConstraintState(state.preferenceState).updateFromIntent(state.intent as any);
    const decision = buildPlannerDecision({ ...state, preferenceState: prefPreview } as GraphState);
    collector?.recordNode({ name: "planner", input: { intent: state.intent, preferenceState: prefPreview } as Record<string, unknown>, output: decision as unknown as Record<string, unknown> });
    return {
      plan: decision.plan,
      planMeta: decision,
      conversationPlan: decision.planHint,
      preferenceState: prefPreview,
      ...withLog(state, { agent: "planner", input: { intent: state.intent } as Record<string, unknown>, output: { ...decision, preferenceState: prefPreview } as unknown as Record<string, unknown> }),
    };
  });

  graph.addNode("executionNode", async (state: GraphState) => {
    const prefManager = new PreferenceConstraintState(state.preferenceState);
    const updatedPreferenceState = prefManager.updateFromIntent(state.intent as any);
    const planMeta = state.planMeta || buildPlannerDecision({ ...state, preferenceState: updatedPreferenceState } as GraphState);

    const history = new OffersHistory(state.offersHistory as any);
    const entities = needsEntities((state.intent as any)?.intent, updatedPreferenceState)
      ? applyPreferencesToItems(loadCatalogEntities(updatedPreferenceState, 18), updatedPreferenceState).slice(0, 12)
      : [];
    let offersMeta: Record<string, unknown> = {
      source: "catalog",
      entities_considered: entities.length,
      appliedPreferences: updatedPreferenceState?.product,
    };
    let offers = planMeta.allowOffers ? buildOffersFromEntities(entities) : [];

    if (planMeta.allowOffers && offers.length === 0) {
      const fallbackEntities = loadCatalogEntities(undefined, 8);
      offers = buildOffersFromEntities(fallbackEntities);
      offersMeta = { ...offersMeta, fallbackUsed: true, source: "catalog-fallback", entities_considered: fallbackEntities.length };
    }
    const negativeIntent = [(state.intent as any)?.intent].some((i) => [INTENT_TYPES.FEEDBACK_NEGATIVE, INTENT_TYPES.FRUSTRATION].includes(i as any));
    const repeatWithChangedConstraints =
      negativeIntent && Boolean(history.last())
        ? true
        : history.detectRepeatWithChanges(offers, state.intent as any, updatedPreferenceState);
    if (repeatWithChangedConstraints) {
      offers = [];
    }

    const routingDecision = evaluateRouting(
      {
        intent: state.intent as any,
        offerCount: offers.length,
        needsClarification: planMeta.needsClarification,
        repeatWithChangedConstraints,
        allowOffers: planMeta.allowOffers,
      },
      undefined,
    );

    const content_state: ContentState & { repeat_with_changed_constraints?: boolean } = {
      ...routingDecision.content_state,
      has_results: offers.length > 0,
      num_results: offers.length,
      repeat_with_changed_constraints: repeatWithChangedConstraints,
      fallback_used: routingDecision.content_state.fallback_used || repeatWithChangedConstraints || offers.length === 0,
      no_relevant_results: routingDecision.content_state.no_relevant_results || offers.length === 0,
    };

    offersMeta = {
      ...offersMeta,
      repeat_with_changed_constraints: repeatWithChangedConstraints,
    };

    const gatingReason = planMeta.allowOffers ? undefined : planMeta.structured ? "waiting_for_explicit_search_intent" : "needs_structured_requirement";

    collector?.recordNode({
      name: "execution",
      input: { intent: state.intent, preferenceState: updatedPreferenceState } as Record<string, unknown>,
      output: { offers: offers.length, content_state } as Record<string, unknown>,
    });

    return {
      preferenceState: updatedPreferenceState,
      offers,
      route: routingDecision.route,
      content_state,
      offersMeta,
      repeat_with_changed_constraints: repeatWithChangedConstraints,
      conversationPlan: planMeta.planHint,
      planMeta,
      gatingReason,
      ...withLog(state, {
        agent: "execution",
        input: { intent: state.intent, preferenceState: updatedPreferenceState } as Record<string, unknown>,
        output: { offers: offers.length, repeatWithChangedConstraints },
      }),
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

  graph.addNode("evaluationNode", async (state: GraphState) => {
    const uiHealth = (state.ui_health as UIHealth) || { degraded_mode: false, render_text_only: false, show_banner: false };
    const content_state = (state.content_state as ContentState & { repeat_with_changed_constraints?: boolean }) || defaultContentState();

    const frustrationSignal = detectFrustrationSignals({
      userMessage: state.userMessage,
      intentType: (state.intent as any)?.intent,
      events: state.clientEvents as ClientEvent[],
    });
    const intentFrustration = Boolean((state.intent as any)?.frustration);
    const frustration = frustrationSignal.frustrated || intentFrustration;

    const evaluation = summarizeEvaluation(content_state, uiHealth, frustration);
    if (evaluation.severity !== "info") {
      recordReflection({
        reason: content_state.repeat_with_changed_constraints ? "repeat_with_changed_constraints" : "fallback_used",
        intent: (state.intent as any)?.intent,
        gatingReason: state.gatingReason || (state.planMeta?.allowOffers ? undefined : "waiting_for_requirements"),
      });
    }
    if (frustration) {
      recordReflection({ reason: "frustration", intent: (state.intent as any)?.intent, gatingReason: "user_frustrated" });
    }

    collector?.recordNode({
      name: "evaluation",
      input: { content_state, uiHealth, frustration } as Record<string, unknown>,
      output: evaluation as Record<string, unknown>,
    });

    const mergedIntent = { ...(state.intent as any), frustration };

    return {
      evaluation,
      intent: mergedIntent as any,
      ...withLog(state, { agent: "evaluation", input: { content_state, uiHealth } as Record<string, unknown>, output: evaluation as Record<string, unknown> }),
    } as Partial<GraphState>;
  });

  graph.addNode("responseNode", async (state: GraphState) => {
    const uiHealth = (state.ui_health as UIHealth) || { degraded_mode: false, render_text_only: false, show_banner: false };
    const content_state = (state.content_state as ContentState & { repeat_with_changed_constraints?: boolean }) || defaultContentState();
    const offers = (state.offers as any[]) || [];
    const preferenceState = (state.preferenceState as PreferenceConstraintStateData) || {
      product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] },
      conversation: {},
      style: {},
    };
    const planHint = state.conversationPlan as string | undefined;
    const reflectionSummary = loadReflectionSummary();
    const evaluation = state.evaluation as TurnEvaluation | undefined;
    const frustration = Boolean((state.intent as any)?.frustration);

    const { reply, followUp } = composeReply({
      content_state,
      uiHealth,
      planHint: planHint || reflectionSummary,
      frustration,
      evaluation,
      lastReply: state.lastReply,
    });

    const visuals = uiHealth.render_text_only ? [] : offers.map((o) => o.image_url).filter(Boolean).slice(0, 6);
    const content = {
      offers,
      visuals,
      definition: "Generische Übersicht",
    };

    const offersHistory = updateOffersHistory(offers, state.intent as any, preferenceState, new OffersHistory(state.offersHistory as any));

    collector?.recordNode({ name: "response", input: { content_state, uiHealth } as Record<string, unknown>, output: { reply, followUp } as Record<string, unknown> });
    return {
      response: { reply, followUp },
      content,
      offersHistory,
      content_state,
      ui_health: uiHealth,
      lastReply: reply,
      ...withLog(state, { agent: "response", input: { content_state, uiHealth } as Record<string, unknown>, output: { reply, followUp } as Record<string, unknown> }),
    };
  });

  graph.addNode("memoryPersistNode", async (state: GraphState) => {
    if (!state.memoryManager || !state.sessionId) return {};
    const snapshot = mergeMemory(state.memorySnapshot as SessionMemorySnapshot | undefined, state.history as ConversationMessage[]);
    const window = new ShortTermMemoryWindow(snapshot.shortTerm);
    window.add([
      { role: "user", content: state.userMessage },
      { role: "assistant", content: (state.response as any)?.reply || "" },
      (state.response as any)?.followUp ? { role: "assistant", content: (state.response as any)?.followUp } : undefined,
    ].filter(Boolean) as ConversationMessage[]);

    const nextSnapshot: SessionMemorySnapshot = {
      shortTerm: window.snapshot(),
      working: (state.preferenceState as PreferenceConstraintStateData) || snapshot.working,
      longTerm: {
        ...snapshot.longTerm,
        lastPlan: state.conversationPlan || snapshot.longTerm.lastPlan,
        lastUiHealthNote: state.ui_health?.note || snapshot.longTerm.lastUiHealthNote,
        reflections: [
          ...(snapshot.longTerm.reflections || []),
          ...(state.evaluation?.notes || []),
        ].filter(Boolean).slice(-20),
        frustrationCount: (snapshot.longTerm.frustrationCount || 0) + (state.intent?.frustration ? 1 : 0),
        personaAdjustments: snapshot.longTerm.personaAdjustments || [],
      },
    };

    state.memoryManager.persist(String(state.sessionId), nextSnapshot);
    collector?.recordNode({ name: "memoryPersist", input: { sessionId: state.sessionId } as Record<string, unknown>, output: nextSnapshot as unknown as Record<string, unknown> });
    return {
      memorySnapshot: nextSnapshot,
      ...withLog(state, { agent: "memoryPersist", input: { sessionId: state.sessionId } as Record<string, unknown>, output: { persisted: true } }),
    };
  });

  graph.addEdge(START, "memoryBootstrapNode" as any);
  graph.addEdge("memoryBootstrapNode" as any, "clientEventNode" as any);
  graph.addEdge("clientEventNode" as any, "intentParserNode" as any);
  graph.addEdge("intentParserNode" as any, "plannerNode" as any);
  graph.addEdge("plannerNode" as any, "executionNode" as any);
  graph.addEdge("executionNode" as any, "uiHealthPolicyNode" as any);
  graph.addEdge("uiHealthPolicyNode" as any, "evaluationNode" as any);
  graph.addEdge("evaluationNode" as any, "responseNode" as any);
  graph.addEdge("responseNode" as any, "memoryPersistNode" as any);
  graph.addEdge("memoryPersistNode" as any, END);

  return graph.compile();
};
