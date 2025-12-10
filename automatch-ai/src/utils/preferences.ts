import { UserCarProfile } from "./types.js";

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
  carProfile?: UserCarProfile;
  filters?: Record<string, unknown>;
};

export const defaultCarProfile = (): UserCarProfile => ({
  budget_level: "flexible",
  usage_pattern: "mixed",
  size_preference: "no_preference",
  design_vibe: [],
  comfort_importance: "medium",
  tech_importance: "medium",
  risk_profile: "balanced",
  explicit_brands_likes: [],
  explicit_brands_dislikes: [],
  deal_breakers: [],
});

const mergeCarProfile = (current: UserCarProfile = defaultCarProfile(), incoming: Partial<UserCarProfile> = {}) => ({
  budget_level: incoming.budget_level || current.budget_level,
  usage_pattern: incoming.usage_pattern || current.usage_pattern,
  size_preference: incoming.size_preference || current.size_preference,
  design_vibe: mergeUnique(current.design_vibe, incoming.design_vibe || []),
  comfort_importance: incoming.comfort_importance || current.comfort_importance,
  tech_importance: incoming.tech_importance || current.tech_importance,
  risk_profile: incoming.risk_profile || current.risk_profile,
  explicit_brands_likes: mergeUnique(current.explicit_brands_likes, incoming.explicit_brands_likes || []),
  explicit_brands_dislikes: mergeUnique(current.explicit_brands_dislikes, incoming.explicit_brands_dislikes || []),
  deal_breakers: mergeUnique(current.deal_breakers, incoming.deal_breakers || []),
});

const derivePreferencesFromProfile = (profile?: UserCarProfile) => {
  const preferredCategories: string[] = [];
  const excludedCategories: string[] = [];
  const useCases: string[] = [];
  const p = profile || defaultCarProfile();

  if (p.size_preference === "suv") preferredCategories.push("suv");
  if (p.size_preference === "compact") preferredCategories.push("kompakt");
  if (p.size_preference === "small") preferredCategories.push("kleinwagen");
  if (p.size_preference === "midsize") preferredCategories.push("kombi");
  if (p.size_preference === "van") preferredCategories.push("van");

  if (p.usage_pattern === "city") useCases.push("stadt");
  if (p.usage_pattern === "long_distance") useCases.push("langstrecke");

  p.explicit_brands_likes.forEach((brand) => preferredCategories.push(brand));
  p.explicit_brands_dislikes.forEach((brand) => excludedCategories.push(brand));

  p.deal_breakers.forEach((breaker) => {
    const lower = breaker.toLowerCase();
    if (lower.includes("kein suv")) excludedCategories.push("suv");
    if (lower.includes("kein diesel")) excludedCategories.push("diesel");
    if (lower.includes("kein elektro") || lower.includes("kein strom")) excludedCategories.push("elektro");
  });

  return {
    preferredCategories,
    excludedCategories,
    useCases,
  };
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

const brandTokens = [
  "vw",
  "volkswagen",
  "audi",
  "bmw",
  "mercedes",
  "mercedes-benz",
  "opel",
  "ford",
  "kia",
  "hyundai",
  "mazda",
  "skoda",
  "dacia",
  "toyota",
  "honda",
  "volvo",
  "seat",
  "cupra",
  "mini",
  "fiat",
  "alfa",
  "alfa romeo",
  "tesla",
  "porsche",
  "peugeot",
  "citroen",
  "renault",
];

const formatBrand = (token: string) => {
  const clean = token.trim();
  if (!clean) return clean;
  return clean
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const extractCarProfileSignals = (normalized: string, budgetRange?: { max?: number }): Partial<UserCarProfile> => {
  const signals: Partial<UserCarProfile> = {};
  if (!normalized) return signals;

  const budgetLow = ["günstig", "billig", "sparsam", "budget", "kleines budget", "nicht viel ausgeben", "günstiges auto"];
  const budgetHigh = ["premium", "teuer", "luxus", "bereit mehr zu zahlen", "egal was es kostet", "oberklasse"];
  if (budgetRange?.max) {
    if (budgetRange.max < 15000) signals.budget_level = "low";
    else if (budgetRange.max > 40000) signals.budget_level = "high";
    else signals.budget_level = "medium";
  } else {
    if (budgetLow.some((t) => normalized.includes(t))) signals.budget_level = "low";
    if (budgetHigh.some((t) => normalized.includes(t))) signals.budget_level = "high";
  }

  if (normalized.match(/\b(stadt|city|kurzstrecke|parkhaus|stop and go)\b/)) {
    signals.usage_pattern = "city";
  } else if (normalized.match(/\b(autobahn|langstrecke|vielfahrer|pendel|urlaub|strecke)\b/)) {
    signals.usage_pattern = "long_distance";
  }

  if (normalized.includes("suv") || normalized.includes("gelände") || normalized.includes("offroad")) signals.size_preference = "suv";
  if (normalized.includes("kombi") || normalized.includes("familie") || normalized.includes("touring")) signals.size_preference = "midsize";
  if (normalized.includes("van") || normalized.includes("bus") || normalized.includes("7-sitzer") || normalized.includes("siebensitzer")) signals.size_preference = "van";
  if (normalized.includes("kompakt") || normalized.includes("kompaktwagen")) signals.size_preference = "compact";
  if (normalized.includes("kleinwagen") || normalized.includes("stadtflitzer") || normalized.includes("mini")) signals.size_preference = "small";

  const vibeMap: Record<string, string> = {
    sportlich: "sportlich",
    "sportlich aber nicht prollig": "sportlich",
    unauffällig: "unauffällig",
    schlicht: "unauffällig",
    klassisch: "klassisch",
    retro: "retro",
    cute: "cute",
    süß: "cute",
  };
  Object.entries(vibeMap).forEach(([key, val]) => {
    if (normalized.includes(key)) {
      signals.design_vibe = mergeUnique(signals.design_vibe || [], [val]);
    }
  });

  if (normalized.includes("komfort") || normalized.includes("bequem") || normalized.includes("ruhig")) signals.comfort_importance = "high";
  if (normalized.includes("ohne schnickschnack") || normalized.includes("robust") || normalized.includes("einfach")) signals.comfort_importance = "low";

  if (normalized.includes("technik") || normalized.includes("assistenz") || normalized.includes("assist") || normalized.includes("display")) signals.tech_importance = "high";
  if (normalized.includes("wenig elektronik") || normalized.includes("keine technik") || normalized.includes("kein schnickschnack")) signals.tech_importance = "low";

  if (normalized.includes("risiko") || normalized.includes("sicherheitsfan") || normalized.includes("zuverlässig") || normalized.includes("keine experimente")) signals.risk_profile = "conservative";
  if (normalized.includes("probier") || normalized.includes("was neues") || normalized.includes("experimentierfreudig")) signals.risk_profile = "adventurous";

  const positiveBrandMatch = normalized.match(/\b(liebe|mag|fan von|favorisiere|gern|markentreu)\s+([a-z0-9äöüß-]+)\b/);
  if (positiveBrandMatch?.[2]) {
    signals.explicit_brands_likes = mergeUnique(signals.explicit_brands_likes || [], [formatBrand(positiveBrandMatch[2])]);
  }

  const brandHits = brandTokens.filter((brand) => normalized.includes(brand));
  if (brandHits.length && !signals.explicit_brands_likes?.length) {
    signals.explicit_brands_likes = mergeUnique(signals.explicit_brands_likes || [], brandHits.map(formatBrand));
  }

  const negativeBrandMatch = normalized.match(/\bkein[e]?\s+([a-z0-9äöüß-]+)\b/);
  if (negativeBrandMatch?.[1]) {
    const value = negativeBrandMatch[1];
    if (brandTokens.includes(value)) {
      signals.explicit_brands_dislikes = mergeUnique(signals.explicit_brands_dislikes || [], [formatBrand(value)]);
    } else if (value.includes("suv") || value.includes("diesel") || value.includes("elektro")) {
      signals.deal_breakers = mergeUnique(signals.deal_breakers || [], [`kein ${value}`]);
    }
  }

  const dealBreakerPatterns = [/\bkein suv\b/, /\bkein diesel\b/, /\bkein elektro\b/, /\bkeine (?:suvs|diesel|elektros)\b/];
  dealBreakerPatterns.forEach((pattern) => {
    const match = normalized.match(pattern);
    if (match?.[0]) {
      signals.deal_breakers = mergeUnique(signals.deal_breakers || [], [match[0]]);
    }
  });

  return signals;
};

const extractPreferenceSignals = (normalized: string) => {
  const preferredCategories: string[] = [];
  const excludedCategories: string[] = [];
  const preferredAttributes: string[] = [];
  const excludedAttributes: string[] = [];
  const useCases: string[] = [];
  const offDomainTokens = ["wetter", "wetterbericht", "regen", "sonne", "schnee", "sturm"];
  const budget = parseBudget(normalized);
  const carProfileSignals = extractCarProfileSignals(normalized, budget);
  const mergedProfile = mergeCarProfile(defaultCarProfile(), carProfileSignals);
  const derivedFromProfile = derivePreferencesFromProfile(mergedProfile);

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
    const candidate = searchMatch[1].trim();
    const isOffDomain = offDomainTokens.some((token) => candidate.includes(token));
    if (!isOffDomain) {
      preferredCategories.push(candidate);
    }
  }

  return {
    product: {
      preferredCategories: mergeUnique(preferredCategories, derivedFromProfile.preferredCategories),
      excludedCategories: mergeUnique(excludedCategories, derivedFromProfile.excludedCategories),
      preferredAttributes,
      excludedAttributes,
      budget,
      useCases: mergeUnique(useCases, derivedFromProfile.useCases),
    },
    conversation: {},
    style: {},
    carProfile: carProfileSignals,
  };
};

export const detectIntent = (input = "") => {
  const normalized = normalizeTokens(input);
  if (!normalized) {
    return { intent: INTENT_TYPES.NEEDS_CLARIFICATION, confidence: 0.3, frustration: false } as const;
  }
  const baseSignals = extractPreferenceSignals(normalized);
  const buildSignals = (overrides: Partial<PreferenceConstraintStateData> = {}) => ({
    product: {
      preferredCategories: mergeUnique(baseSignals.product.preferredCategories || [], overrides.product?.preferredCategories || []),
      excludedCategories: mergeUnique(baseSignals.product.excludedCategories || [], overrides.product?.excludedCategories || []),
      preferredAttributes: mergeUnique(baseSignals.product.preferredAttributes || [], overrides.product?.preferredAttributes || []),
      excludedAttributes: mergeUnique(baseSignals.product.excludedAttributes || [], overrides.product?.excludedAttributes || []),
      budget: overrides.product?.budget || baseSignals.product.budget,
      useCases: mergeUnique(baseSignals.product.useCases || [], overrides.product?.useCases || []),
    },
    conversation: { ...(baseSignals.conversation || {}), ...(overrides.conversation || {}) },
    style: { ...(baseSignals.style || {}), ...(overrides.style || {}) },
    carProfile: mergeCarProfile(mergeCarProfile(defaultCarProfile(), baseSignals.carProfile as any), overrides.carProfile),
  });

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
      preferenceSignals: buildSignals({
        conversation: { knowledgeLevel: "novice", desiredMode: "onboarding", wantsGuidedQuestions: true, detailLevel: "low" },
        product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [] },
        style: { brevity: "normal", vibe: ["supportive"] },
      }),
    } as const;
  }

  const weatherTokens = ["wetter", "regen", "sonne", "schnee", "wetterbericht", "wetter bericht"];
  const smallTalkTokens = ["wie geht", "na ", "alles klar", "servus", "moin", "hi", "hallo"];
  const isWeather = weatherTokens.some((token) => normalized.includes(token));
  const isSmallTalk = smallTalkTokens.some((token) => normalized.includes(token));
  if (isWeather || isSmallTalk) {
    return {
      intent: INTENT_TYPES.SMALL_TALK,
      confidence: 0.65,
      frustration: false,
      preferenceSignals: buildSignals({
        conversation: { tone: "warm", detailLevel: "low" },
        style: { brevity: "short", vibe: ["casual"] },
      }),
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
      preferenceSignals: buildSignals({
        conversation: { desiredMode: "onboarding", wantsGuidedQuestions: true },
        style: { vibe: ["collaborative"] },
      }),
    } as const;
  }

  const metaTokens = ["eigentlich", "vorher mal", "lass uns erst", "bevor wir", "kannst du kurz sagen", "metakommunikation"];
  if (metaTokens.some((token) => normalized.includes(token))) {
    return {
      intent: INTENT_TYPES.META_COMMUNICATION,
      confidence: 0.7,
      frustration: false,
      preferenceSignals: buildSignals({
        conversation: { desiredMode: "onboarding", detailLevel: "balanced" },
        style: { vibe: ["patient"] },
      }),
    } as const;
  }

  const frustrationTokens = ["useless", "broken", "frustrating", "doesn't work", "not working", "you failed", "kaputt", "funktioniert nicht", "geht nicht", "nervig"];
  if (frustrationTokens.some((token) => normalized.includes(token))) {
    return { intent: INTENT_TYPES.FRUSTRATION, confidence: 0.85, frustration: true, preferenceSignals: buildSignals() } as const;
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
    return { intent: INTENT_TYPES.FEEDBACK_NEGATIVE, confidence: 0.8, frustration: true, preferenceSignals: buildSignals() } as const;
  }

  const positiveFeedbackTokens = ["helpful", "great", "perfect", "nice", "works well", "passt", "super", "danke dir"];
  if (positiveFeedbackTokens.some((token) => normalized.includes(token))) {
    return { intent: INTENT_TYPES.FEEDBACK_POSITIVE, confidence: 0.7, frustration: false, preferenceSignals: buildSignals() } as const;
  }

  const hasPreferred = (baseSignals.product.preferredCategories || []).length > 0;
  if (hasPreferred) {
    return {
      intent: INTENT_TYPES.PREFERENCE_CHANGE,
      confidence: 0.78,
      frustration: false,
      preferenceSignals: buildSignals(),
    } as const;
  }
  if ((baseSignals.product.excludedCategories || []).length > 0) {
    return {
      intent: INTENT_TYPES.CONSTRAINT_UPDATE,
      confidence: 0.72,
      frustration: false,
      preferenceSignals: buildSignals(),
    } as const;
  }

  const brevityTokens = ["zu lang", "zu viele worte", "kürzer"];
  if (brevityTokens.some((token) => normalized.includes(token))) {
    return {
      intent: INTENT_TYPES.INFORMATION,
      confidence: 0.6,
      frustration: false,
      preferenceSignals: buildSignals({
        style: { brevity: "short", vibe: ["concise"] },
      }),
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
        preferenceSignals: buildSignals({
          product: {
            preferredCategories: [singleToken],
            excludedCategories: [],
            preferredAttributes: [],
            excludedAttributes: [],
            useCases: [],
          },
        }),
      } as const;
    }
  }

  if (normalized.length < 6) {
    return { intent: INTENT_TYPES.NEEDS_CLARIFICATION, confidence: 0.6, frustration: false } as const;
  }

  return { intent: INTENT_TYPES.INFORMATION, confidence: 0.65, frustration: false, preferenceSignals: buildSignals() } as const;
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
      carProfile: mergeCarProfile(defaultCarProfile(), initialState.carProfile),
      filters: initialState.filters || {},
    };

    const derived = derivePreferencesFromProfile(this.state.carProfile);
    this.state.product.preferredCategories = mergeUnique(this.state.product.preferredCategories, derived.preferredCategories);
    this.state.product.excludedCategories = mergeUnique(this.state.product.excludedCategories, derived.excludedCategories);
    this.state.product.useCases = mergeUnique(this.state.product.useCases || [], derived.useCases);
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
    const carProfile = signals.carProfile;

    this.state.product.preferredCategories = mergeUnique(this.state.product.preferredCategories, product.preferredCategories || []);
    this.state.product.excludedCategories = mergeUnique(this.state.product.excludedCategories, product.excludedCategories || []);
    this.state.product.preferredAttributes = mergeUnique(this.state.product.preferredAttributes, product.preferredAttributes || []);
    this.state.product.excludedAttributes = mergeUnique(this.state.product.excludedAttributes, product.excludedAttributes || []);
    this.state.product.useCases = mergeUnique(this.state.product.useCases || [], product.useCases || []);
    this.state.product.budget = this.state.product.budget || product.budget;

    this.state.conversation = { ...this.state.conversation, ...conversation };

    this.state.style.vibe = mergeUnique(this.state.style.vibe || [], style.vibe || []);
    this.state.style.brevity = style.brevity || this.state.style.brevity;

    if (carProfile) {
      this.state.carProfile = mergeCarProfile(this.state.carProfile, carProfile);
      const derived = derivePreferencesFromProfile(this.state.carProfile);
      this.state.product.preferredCategories = mergeUnique(this.state.product.preferredCategories, derived.preferredCategories);
      this.state.product.excludedCategories = mergeUnique(this.state.product.excludedCategories, derived.excludedCategories);
      this.state.product.useCases = mergeUnique(this.state.product.useCases || [], derived.useCases);
    }
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
  const carProfile = preferenceState.carProfile || defaultCarProfile();
  const carSignals =
    carProfile.size_preference !== "no_preference" ||
    carProfile.usage_pattern !== "mixed" ||
    (carProfile.design_vibe || []).length > 0 ||
    (carProfile.explicit_brands_likes || []).length > 0 ||
    (carProfile.explicit_brands_dislikes || []).length > 0 ||
    (carProfile.deal_breakers || []).length > 0 ||
    carProfile.budget_level !== "flexible";
  return Boolean(
    (product.preferredCategories && product.preferredCategories.length > 0) ||
      (product.excludedCategories && product.excludedCategories.length > 0) ||
      (product.preferredAttributes && product.preferredAttributes.length > 0) ||
      (product.excludedAttributes && product.excludedAttributes.length > 0) ||
      (product.useCases && product.useCases.length > 0) ||
      product.budget ||
      carSignals,
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
    carProfile: defaultCarProfile(),
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
    carProfile: defaultCarProfile(),
  },
  b: PreferenceConstraintStateData = {
    product: { preferredCategories: [], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] },
    conversation: {},
    style: {},
    carProfile: defaultCarProfile(),
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
  const normalizeProfile = (profile?: UserCarProfile) => {
    const p = profile || defaultCarProfile();
    return {
      budget_level: p.budget_level || "flexible",
      usage_pattern: p.usage_pattern || "mixed",
      size_preference: p.size_preference || "no_preference",
      design_vibe: (p.design_vibe || []).map(normalizeTokens).sort(),
      comfort_importance: p.comfort_importance || "medium",
      tech_importance: p.tech_importance || "medium",
      risk_profile: p.risk_profile || "balanced",
      likes: (p.explicit_brands_likes || []).map(normalizeTokens).sort(),
      dislikes: (p.explicit_brands_dislikes || []).map(normalizeTokens).sort(),
      breakers: (p.deal_breakers || []).map(normalizeTokens).sort(),
    };
  };
  const normA = normalizeProfile(a.carProfile);
  const normB = normalizeProfile(b.carProfile);
  const carProfileEqual =
    normA.budget_level === normB.budget_level &&
    normA.usage_pattern === normB.usage_pattern &&
    normA.size_preference === normB.size_preference &&
    normA.comfort_importance === normB.comfort_importance &&
    normA.tech_importance === normB.tech_importance &&
    normA.risk_profile === normB.risk_profile &&
    normA.design_vibe.length === normB.design_vibe.length &&
    normA.design_vibe.every((val, idx) => val === normB.design_vibe[idx]) &&
    normA.likes.length === normB.likes.length &&
    normA.likes.every((val, idx) => val === normB.likes[idx]) &&
    normA.dislikes.length === normB.dislikes.length &&
    normA.dislikes.every((val, idx) => val === normB.dislikes[idx]) &&
    normA.breakers.length === normB.breakers.length &&
    normA.breakers.every((val, idx) => val === normB.breakers[idx]);

  return productEqual && conversationEqual && carProfileEqual;
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
