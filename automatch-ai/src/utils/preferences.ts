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
} as const;

export type PreferenceConstraintStateData = {
  preferredCategories: string[];
  excludedCategories: string[];
  preferredAttributes: string[];
  excludedAttributes: string[];
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

const extractPreferenceSignals = (normalized: string) => {
  const preferredCategories: string[] = [];
  const excludedCategories: string[] = [];
  const preferredAttributes: string[] = [];
  const excludedAttributes: string[] = [];

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

  return { preferredCategories, excludedCategories, preferredAttributes, excludedAttributes };
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
  if (preferenceSignals.preferredCategories.length > 0) {
    return {
      intent: INTENT_TYPES.PREFERENCE_CHANGE,
      confidence: 0.78,
      frustration: false,
      preferenceSignals,
    } as const;
  }
  if (preferenceSignals.excludedCategories.length > 0) {
    return {
      intent: INTENT_TYPES.CONSTRAINT_UPDATE,
      confidence: 0.72,
      frustration: false,
      preferenceSignals,
    } as const;
  }

  if (normalized.length < 6) {
    return { intent: INTENT_TYPES.NEEDS_CLARIFICATION, confidence: 0.6, frustration: false } as const;
  }

  return { intent: INTENT_TYPES.INFORMATION, confidence: 0.65, frustration: false } as const;
};

export class PreferenceConstraintState {
  state: PreferenceConstraintStateData;

  constructor(initialState: Partial<PreferenceConstraintStateData> = {}) {
    this.state = {
      preferredCategories: [],
      excludedCategories: [],
      preferredAttributes: [],
      excludedAttributes: [],
      filters: {},
      ...initialState,
    };
  }

  updateFromIntent(intent: { preferenceSignals?: Partial<PreferenceConstraintStateData> } = {}) {
    const signals = intent.preferenceSignals || {};
    if (!signals) return this.state;
    this.mergeSignals(signals);
    return this.state;
  }

  mergeSignals({ preferredCategories = [], excludedCategories = [], preferredAttributes = [], excludedAttributes = [] }: Partial<PreferenceConstraintStateData>) {
    this.state.preferredCategories = mergeUnique(this.state.preferredCategories, preferredCategories);
    this.state.excludedCategories = mergeUnique(this.state.excludedCategories, excludedCategories);
    this.state.preferredAttributes = mergeUnique(this.state.preferredAttributes, preferredAttributes);
    this.state.excludedAttributes = mergeUnique(this.state.excludedAttributes, excludedAttributes);
  }

  getState() {
    return this.state;
  }
}

export const needsEntities = (intentType?: string) =>
  [
    INTENT_TYPES.INFORMATION,
    INTENT_TYPES.COMPLAINT,
    INTENT_TYPES.PREFERENCE_CHANGE,
    INTENT_TYPES.CONSTRAINT_UPDATE,
    INTENT_TYPES.FEEDBACK_NEGATIVE,
    INTENT_TYPES.FEEDBACK_POSITIVE,
    INTENT_TYPES.FRUSTRATION,
  ].includes(intentType as string);

export const applyPreferencesToItems = (items: any[] = [], preferenceState: PreferenceConstraintStateData = {
  preferredCategories: [],
  excludedCategories: [],
  preferredAttributes: [],
  excludedAttributes: [],
  filters: {},
}) => {
  const excludedCategories = new Set((preferenceState.excludedCategories || []).map((c) => normalizeTokens(c)));
  const excludedAttributes = new Set((preferenceState.excludedAttributes || []).map((c) => normalizeTokens(c)));
  const preferredCategories = new Set((preferenceState.preferredCategories || []).map((c) => normalizeTokens(c)));
  const preferredAttributes = new Set((preferenceState.preferredAttributes || []).map((c) => normalizeTokens(c)));

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

const isStateEqual = (a: PreferenceConstraintStateData = {
  preferredCategories: [],
  excludedCategories: [],
  preferredAttributes: [],
  excludedAttributes: [],
}, b: PreferenceConstraintStateData = {
  preferredCategories: [],
  excludedCategories: [],
  preferredAttributes: [],
  excludedAttributes: [],
}) => {
  return ["preferredCategories", "excludedCategories", "preferredAttributes", "excludedAttributes"].every((key) => {
    const arrA = ((a as any)[key] || []).map(normalizeTokens).sort();
    const arrB = ((b as any)[key] || []).map(normalizeTokens).sort();
    return arrA.length === arrB.length && arrA.every((val: string, idx: number) => val === arrB[idx]);
  });
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
