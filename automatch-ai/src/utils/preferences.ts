export const INTENT_TYPES = {
  INFORMATION: "informational",
  AFFIRMATION: "affirmation",
  CONTINUE: "continue",
  COMPLAINT: "complaint",
  SMALL_TALK: "small_talk",
  PREFERENCE_CHANGE: "preference_change",
  CONSTRAINT_UPDATE: "constraint_update",
  FEEDBACK_POSITIVE: "feedback_positive",
  FEEDBACK_NEGATIVE: "feedback_negative",
  FRUSTRATION: "frustration",
  NEEDS_CLARIFICATION: "needs_clarification",
  META_COMMUNICATION: "meta_communication",
  KNOWLEDGE_SIGNAL: "knowledge_signal",
  MODE_REQUEST: "mode_request",
} as const;

export type IntentLiteral = (typeof INTENT_TYPES)[keyof typeof INTENT_TYPES];

export type ProductPreference = {
  preferredCategories: string[];
  excludedCategories: string[];
  preferredAttributes: string[];
  excludedAttributes: string[];
  budget?: { min?: number; max?: number };
  useCases?: string[];
};

export type ConversationPreference = {
  knowledgeLevel?: "novice" | "intermediate" | "expert";
  desiredMode?: "onboarding" | "direct";
  detailLevel?: "low" | "balanced" | "high";
  tone?: "warm" | "concise" | "neutral";
  wantsGuidedQuestions?: boolean;
};

export type StylePreference = {
  vibe?: string[];
  brevity?: "short" | "normal" | "detailed";
};

export type PreferenceConstraintStateData = {
  product: ProductPreference;
  conversation: ConversationPreference;
  style: StylePreference;
  filters?: Record<string, unknown>;
};

const normalizeTokens = (input = "") => input.toLowerCase().trim();

const mergeUnique = (existing: string[] = [], incoming: string[] = []) => {
  const map = new Map<string, string>();
  existing.forEach((entry) => map.set(entry.toLowerCase(), entry));
  incoming.forEach((entry) => {
    if (!entry) return;
    const key = entry.toLowerCase();
    if (!map.has(key)) map.set(key, entry);
  });
  return Array.from(map.values());
};

const parseBudget = (normalized: string) => {
  const match = normalized.match(/\b(?:unter|bis|max|budget|<=?)\s*(\d{2,5})(?:[.,](\d{1,2}))?\b/);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return undefined;
  return { max: value };
};

const extractPreferenceSignals = (normalized: string) => {
  const preferredCategories: string[] = [];
  const excludedCategories: string[] = [];
  const preferredAttributes: string[] = [];
  const excludedAttributes: string[] = [];
  const useCases: string[] = [];

  const preferRegex = /\b(?:prefer|rather have|like|lieber|bevorzuge)\s+([^.,;]+?)(?:\s+over\s+([^.,;]+))?(?:\.|,|;|$)/;
  const preferMatch = normalized.match(preferRegex);
  if (preferMatch) {
    const preferred = preferMatch[1]?.trim();
    const against = preferMatch[2]?.trim();
    if (preferred) preferredCategories.push(preferred);
    if (against) excludedCategories.push(against);
  }

  const negativePatterns = [
    /\bno\s+([a-z0-9\s-]+?)(?:\.|,|;|$)/g,
    /\bwithout\s+([a-z0-9\s-]+?)(?:\.|,|;|$)/g,
    /\bexclude\s+([a-z0-9\s-]+?)(?:\.|,|;|$)/g,
    /\bavoid\s+([a-z0-9\s-]+?)(?:\.|,|;|$)/g,
    /\bkein[e]?\s+([a-z0-9\s-]+?)(?:\.|,|;|$)/g,
    /\bkeine\s+([a-z0-9\s-]+?)(?:\.|,|;|$)/g,
  ];
  negativePatterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      if (match[1]) {
        const value = match[1].trim();
        excludedCategories.push(value);
        excludedAttributes.push(value);
      }
    }
  });

  const useCaseRegex = /\b(stadt|stadtverkehr|langstrecke|gebirge|gelände|offroad|familie|pendeln)\b/;
  const useCaseMatch = normalized.match(useCaseRegex);
  if (useCaseMatch) {
    useCases.push(useCaseMatch[1]);
  }

  if (normalized.includes("vielfahrer") || normalized.includes("viel fahr") || normalized.includes("viel fahre")) {
    useCases.push("langstrecke");
  }

  const searchPattern = /\b(?:suche|zeige|zeig|finde)\s+([^.,;]+)/;
  const searchMatch = normalized.match(searchPattern);
  if (searchMatch && searchMatch[1]) {
    preferredCategories.push(searchMatch[1].trim());
  }

  return {
    product: {
      preferredCategories,
      excludedCategories,
      preferredAttributes,
      excludedAttributes,
      budget: parseBudget(normalized),
      useCases,
    },
    conversation: {},
    style: {},
  };
};

export const detectIntent = (input = "") => {
  const normalized = normalizeTokens(input);
  if (!normalized) {
    return { intent: INTENT_TYPES.NEEDS_CLARIFICATION, confidence: 0.3, frustration: false } as const;
  }

  const affirmationTokens = ["ok", "okay", "yes", "sure", "danke", "thanks", "thank you", "got it", "passt", "alles klar"];
  if (
    affirmationTokens.some(
      (token) => normalized === token || normalized.startsWith(`${token}!`) || normalized.startsWith(`${token}.`)
    )
  ) {
    return { intent: INTENT_TYPES.AFFIRMATION, confidence: 0.9, frustration: false } as const;
  }

  const knowledgeTokens = [
    "kenne mich nicht aus",
    "bin neu",
    "keine ahnung",
    "wie geht das",
    "brauch hilfe",
    "erklär",
    "bitte erklär",
  ];
  if (knowledgeTokens.some((token) => normalized.includes(token))) {
    return {
      intent: INTENT_TYPES.KNOWLEDGE_SIGNAL,
      confidence: 0.82,
      frustration: false,
      preferenceSignals: {
        conversation: { knowledgeLevel: "novice", desiredMode: "onboarding", wantsGuidedQuestions: true, detailLevel: "low" },
        product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [] },
        style: { brevity: "normal", vibe: ["supportive"] },
      },
    } as const;
  }

  const modeRequestTokens = [
    "frag mich",
    "stell mir fragen",
    "führ mich",
    "guiding",
    "plan",
    "erst fragen",
    "schritt für schritt",
  ];
  if (modeRequestTokens.some((token) => normalized.includes(token))) {
    return {
      intent: INTENT_TYPES.MODE_REQUEST,
      confidence: 0.8,
      frustration: false,
      preferenceSignals: {
        conversation: { desiredMode: "onboarding", wantsGuidedQuestions: true },
        product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [] },
        style: { vibe: ["collaborative"] },
      },
    } as const;
  }

  const metaTokens = ["eigentlich", "vorher mal", "lass uns erst", "bevor wir", "kannst du kurz sagen", "metakommunikation"];
  if (metaTokens.some((token) => normalized.includes(token))) {
    return {
      intent: INTENT_TYPES.META_COMMUNICATION,
      confidence: 0.7,
      frustration: false,
      preferenceSignals: {
        conversation: { desiredMode: "onboarding", detailLevel: "balanced" },
        product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [] },
        style: { vibe: ["patient"] },
      },
    } as const;
  }

  const frustrationTokens = ["useless", "broken", "frustrating", "doesn't work", "not working", "you failed", "kaputt", "funktioniert nicht", "geht nicht", "nervig"];
  if (frustrationTokens.some((token) => normalized.includes(token))) {
    return { intent: INTENT_TYPES.FRUSTRATION, confidence: 0.85, frustration: true } as const;
  }

  const negativeFeedbackTokens = [
    "not helpful",
    "waste",
    "bad suggestion",
    "this is wrong",
    "worse",
    "same again",
    "gleich wie vorher",
    "schon wieder",
    "nichts anderes",
    "etwas anderes",
    "was anderes",
    "noch etwas anderes",
  ];
  if (negativeFeedbackTokens.some((token) => normalized.includes(token))) {
    return { intent: INTENT_TYPES.FEEDBACK_NEGATIVE, confidence: 0.8, frustration: true } as const;
  }

  const positiveFeedbackTokens = ["helpful", "great", "perfect", "nice", "works well", "passt", "super", "danke dir"];
  if (positiveFeedbackTokens.some((token) => normalized.includes(token))) {
    return { intent: INTENT_TYPES.FEEDBACK_POSITIVE, confidence: 0.7, frustration: false } as const;
  }

  const preferenceSignals = extractPreferenceSignals(normalized);
  if (preferenceSignals.product.preferredCategories.length > 0) {
    return {
      intent: INTENT_TYPES.PREFERENCE_CHANGE,
      confidence: 0.78,
      frustration: false,
      preferenceSignals,
    } as const;
  }
  if (preferenceSignals.product.excludedCategories.length > 0) {
    return {
      intent: INTENT_TYPES.CONSTRAINT_UPDATE,
      confidence: 0.72,
      frustration: false,
      preferenceSignals,
    } as const;
  }

  const weatherTokens = ["wetter", "regen", "sonne", "schnee", "wetterbericht", "wetter bericht"];
  if (weatherTokens.some((token) => normalized.includes(token))) {
    return {
      intent: INTENT_TYPES.SMALL_TALK,
      confidence: 0.65,
      frustration: false,
      preferenceSignals: {
        conversation: { tone: "warm" },
        product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] },
        style: { brevity: "short", vibe: ["casual"] },
      },
    } as const;
  }

  const brevityTokens = ["zu lang", "zu viele worte", "kürzer"];
  if (brevityTokens.some((token) => normalized.includes(token))) {
    return {
      intent: INTENT_TYPES.INFORMATION,
      confidence: 0.6,
      frustration: false,
      preferenceSignals: {
        style: { brevity: "short", vibe: ["concise"] },
        product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] },
        conversation: {},
      },
    } as const;
  }

  // Single-token brand/model hints (e.g. "jeep", "vw") should still trigger a search intent
  const singleToken = normalized.trim();
  const ignoreTokens = new Set(["ja", "nein", "hi", "hallo", "moin", "hey", "servus", "kein", "nicht", "no"]);
  const shortBrandTokens = new Set(["vw", "gmc", "kia", "ram", "bmw"]);
  if (singleToken && singleToken.indexOf(" ") === -1 && !ignoreTokens.has(singleToken)) {
    if (singleToken.length >= 3 || shortBrandTokens.has(singleToken)) {
      return {
        intent: INTENT_TYPES.PREFERENCE_CHANGE,
        confidence: 0.7,
        frustration: false,
        preferenceSignals: {
          product: {
            preferredCategories: [singleToken],
            excludedCategories: [],
            preferredAttributes: [],
            excludedAttributes: [],
            useCases: [],
          },
          conversation: {},
          style: {},
        },
      } as const;
    }
  }

  if (normalized.length < 6) {
    return { intent: INTENT_TYPES.NEEDS_CLARIFICATION, confidence: 0.6, frustration: false } as const;
  }

  return { intent: INTENT_TYPES.INFORMATION, confidence: 0.65, frustration: false, preferenceSignals } as const;
};

export class PreferenceConstraintState {
  state: PreferenceConstraintStateData;

  constructor(initialState: Partial<PreferenceConstraintStateData> = {}) {
    this.state = {
      product: {
        preferredCategories: [],
        excludedCategories: [],
        preferredAttributes: [],
        excludedAttributes: [],
        budget: undefined,
        useCases: [],
        ...(initialState.product || {}),
      },
      conversation: {
        knowledgeLevel: initialState.conversation?.knowledgeLevel,
        desiredMode: initialState.conversation?.desiredMode,
        detailLevel: initialState.conversation?.detailLevel,
        tone: initialState.conversation?.tone,
        wantsGuidedQuestions: initialState.conversation?.wantsGuidedQuestions,
      },
      style: {
        vibe: initialState.style?.vibe || [],
        brevity: initialState.style?.brevity,
      },
      filters: initialState.filters || {},
    };
  }

  updateFromIntent(intent: { preferenceSignals?: Partial<PreferenceConstraintStateData> } = {}) {
    const signals = intent.preferenceSignals || {};
    if (!signals) return this.state;
    this.mergeSignals(signals);
    return this.state;
  }

  mergeSignals(signals: Partial<PreferenceConstraintStateData>) {
    const product: Partial<ProductPreference> = signals.product || {};
    const conversation: Partial<ConversationPreference> = signals.conversation || {};
    const style: Partial<StylePreference> = signals.style || {};

    this.state.product.preferredCategories = mergeUnique(this.state.product.preferredCategories, product.preferredCategories || []);
    this.state.product.excludedCategories = mergeUnique(this.state.product.excludedCategories, product.excludedCategories || []);
    this.state.product.preferredAttributes = mergeUnique(this.state.product.preferredAttributes, product.preferredAttributes || []);
    this.state.product.excludedAttributes = mergeUnique(this.state.product.excludedAttributes, product.excludedAttributes || []);
    this.state.product.useCases = mergeUnique(this.state.product.useCases || [], product.useCases || []);
    this.state.product.budget = this.state.product.budget || product.budget;

    this.state.conversation = { ...this.state.conversation, ...conversation };

    this.state.style.vibe = mergeUnique(this.state.style.vibe || [], style.vibe || []);
    this.state.style.brevity = style.brevity || this.state.style.brevity;
  }

  getState() {
    return this.state;
  }
}

const ENTITY_INTENTS = [
  INTENT_TYPES.INFORMATION,
  INTENT_TYPES.COMPLAINT,
  INTENT_TYPES.PREFERENCE_CHANGE,
  INTENT_TYPES.CONSTRAINT_UPDATE,
  INTENT_TYPES.FEEDBACK_NEGATIVE,
  INTENT_TYPES.FEEDBACK_POSITIVE,
  INTENT_TYPES.FRUSTRATION,
] as const;

export const isSearchIntent = (intentType?: IntentLiteral) =>
  intentType ? (ENTITY_INTENTS as ReadonlyArray<IntentLiteral>).includes(intentType) : false;

export const hasStructuredProductRequirement = (preferenceState?: PreferenceConstraintStateData) => {
  if (!preferenceState) return false;
  const product = preferenceState.product || {
    preferredCategories: [],
    excludedCategories: [],
    preferredAttributes: [],
    excludedAttributes: [],
    useCases: [],
  };
  return Boolean(
    (product.preferredCategories && product.preferredCategories.length > 0) ||
      (product.excludedCategories && product.excludedCategories.length > 0) ||
      (product.preferredAttributes && product.preferredAttributes.length > 0) ||
      (product.excludedAttributes && product.excludedAttributes.length > 0) ||
      (product.useCases && product.useCases.length > 0) ||
      product.budget,
  );
};

export const needsEntities = (intentType?: IntentLiteral, preferenceState?: PreferenceConstraintStateData) =>
  isSearchIntent(intentType) && hasStructuredProductRequirement(preferenceState);

export const applyPreferencesToItems = (
  items: any[] = [],
  preferenceState: PreferenceConstraintStateData = {
    product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] },
    conversation: {},
    style: {},
  },
) => {
  const product = preferenceState.product || { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] };
  const excludedCategories = new Set((product.excludedCategories || []).map((c) => normalizeTokens(c)));
  const excludedAttributes = new Set((product.excludedAttributes || []).map((c) => normalizeTokens(c)));
  const preferredCategories = new Set((product.preferredCategories || []).map((c) => normalizeTokens(c)));
  const preferredAttributes = new Set((product.preferredAttributes || []).map((c) => normalizeTokens(c)));

  const filtered = items.filter((item) => {
    const cat = item.category ? normalizeTokens(item.category) : null;
    if (cat) {
      const blocked = Array.from(excludedCategories).some(
        (excluded) => excluded === cat || excluded.includes(cat) || cat.includes(excluded)
      );
      if (blocked) return false;
    }
    const attrs = item.attributes || [];
    if (
      attrs.some((attr: string) => {
        const normalized = normalizeTokens(attr);
        return Array.from(excludedAttributes).some(
          (excluded) => excluded === normalized || excluded.includes(normalized) || normalized.includes(excluded)
        );
      })
    )
      return false;
    return true;
  });

  const ranked = [...filtered].sort((a, b) => {
    const score = (item: any) => {
      const cat = item.category ? normalizeTokens(item.category) : "";
      const attrs = item.attributes || [];
      let val = 0;
      if (cat && preferredCategories.has(cat)) val += 2;
      if (attrs.some((attr: string) => preferredAttributes.has(normalizeTokens(attr)))) val += 1;
      return val;
    };
    return score(b) - score(a);
  });

  return ranked;
};

const isStateEqual = (
  a: PreferenceConstraintStateData = {
    product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] },
    conversation: {},
    style: {},
  },
  b: PreferenceConstraintStateData = {
    product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] },
    conversation: {},
    style: {},
  },
) => {
  const productKeys = ["preferredCategories", "excludedCategories", "preferredAttributes", "excludedAttributes", "useCases"] as const;
  const productEqual = productKeys.every((key) => {
    const arrA = ((a.product as any)[key] || []).map(normalizeTokens).sort();
    const arrB = ((b.product as any)[key] || []).map(normalizeTokens).sort();
    return arrA.length === arrB.length && arrA.every((val: string, idx: number) => val === arrB[idx]);
  });
  const conversationEqual =
    (a.conversation?.desiredMode || "") === (b.conversation?.desiredMode || "") &&
    (a.conversation?.knowledgeLevel || "") === (b.conversation?.knowledgeLevel || "");
  return productEqual && conversationEqual;
};

export type OfferHistoryEntry = {
  timestamp: string;
  items: string[];
  intentType?: string;
  preferenceState: PreferenceConstraintStateData;
};

export class OffersHistory {
  history: OfferHistoryEntry[];

  constructor(initial: OfferHistoryEntry[] = []) {
    this.history = [...initial];
  }

  last() {
    return this.history[this.history.length - 1];
  }

  record(entry: { items: any[]; intentType?: string; preferenceState: PreferenceConstraintStateData }) {
    this.history.push({
      timestamp: new Date().toISOString(),
      items: (entry.items || []).map((item) => item.id || item.vin).filter(Boolean),
      intentType: entry.intentType,
      preferenceState: { ...entry.preferenceState },
    });
  }

  detectRepeatWithChanges(items: any[] = [], intent: { intent?: string } = {}, preferenceState: PreferenceConstraintStateData) {
    const last = this.last();
    if (!last) return false;
    const currentIds = (items || []).map((item) => item.id || item.vin).filter(Boolean).sort();
    const lastIds = [...(last.items || [])].sort();
    const sameItems = currentIds.length === lastIds.length && currentIds.every((id, idx) => id === lastIds[idx]);
    if (!sameItems) return false;
    const intentChanged = intent?.intent !== last.intentType;
    const stateChanged = !isStateEqual(last.preferenceState, preferenceState);
    return intentChanged || stateChanged;
  }

  snapshot() {
    return [...this.history];
  }
}
