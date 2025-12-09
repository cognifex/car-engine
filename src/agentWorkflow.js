import { mapStateToRenderMode, UIHealthStateMachine, UI_HEALTH_EVENTS, UI_HEALTH_STATES } from './uiHealthAggregator';

export const INTENT_TYPES = {
  INFORMATION: 'information',
  AFFIRMATION: 'affirmation',
  CONTINUE: 'continue',
  COMPLAINT: 'complaint',
  SMALL_TALK: 'small_talk',
  PREFERENCE_CHANGE: 'preference_change',
  CONSTRAINT_UPDATE: 'constraint_update',
  FEEDBACK_POSITIVE: 'feedback_positive',
  FEEDBACK_NEGATIVE: 'feedback_negative',
  FRUSTRATION: 'frustration',
};

const DEFAULT_RETRIEVER = async (query) => [
  {
    id: 'item-1',
    title: 'Item A',
    summary: `Result for ${query}`,
    category: 'type a',
    attributes: ['baseline'],
  },
  {
    id: 'item-2',
    title: 'Item B',
    summary: `Alternative for ${query}`,
    category: 'type b',
    attributes: ['variant'],
  },
];

const normalizeTokens = (input = '') => input.toLowerCase().trim();

const extractPreferenceSignals = (normalized) => {
  const preferredCategories = [];
  const excludedCategories = [];
  const preferredAttributes = [];
  const excludedAttributes = [];

  const preferRegex = /\b(prefer|rather have|like)\s+([^.,;]+?)(?:\s+over\s+([^.,;]+))?(?:\.|,|;|$)/;
  const preferMatch = normalized.match(preferRegex);
  if (preferMatch) {
    const preferred = preferMatch[2]?.trim();
    const against = preferMatch[3]?.trim();
    if (preferred) preferredCategories.push(preferred);
    if (against) excludedCategories.push(against);
  }

  const negativePatterns = [
    /\bno\s+([a-z0-9\s-]+?)(?:\.|,|;|$)/g,
    /\bwithout\s+([a-z0-9\s-]+?)(?:\.|,|;|$)/g,
    /\bexclude\s+([a-z0-9\s-]+?)(?:\.|,|;|$)/g,
    /\bavoid\s+([a-z0-9\s-]+?)(?:\.|,|;|$)/g,
  ];
  negativePatterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      if (match[1]) {
        excludedCategories.push(match[1].trim());
      }
    }
  });

  return { preferredCategories, excludedCategories, preferredAttributes, excludedAttributes };
};

export function detectIntent(input = '') {
  const normalized = normalizeTokens(input);
  if (!normalized) {
    return { type: INTENT_TYPES.SMALL_TALK, confidence: 0.2 };
  }

  const affirmationTokens = ['ok', 'okay', 'yes', 'sure', 'thanks', 'thank you', 'got it'];
  if (
    affirmationTokens.some(
      (token) => normalized === token || normalized.startsWith(`${token}!`) || normalized.startsWith(`${token}.`)
    )
  ) {
    return { type: INTENT_TYPES.AFFIRMATION, confidence: 0.9 };
  }

  const frustrationTokens = ['useless', 'broken', 'frustrating', "doesn't work", 'not working', 'you failed'];
  if (frustrationTokens.some((token) => normalized.includes(token))) {
    return { type: INTENT_TYPES.FRUSTRATION, confidence: 0.85 };
  }

  const negativeFeedbackTokens = ['not helpful', 'waste', 'bad suggestion', 'this is wrong', 'worse'];
  if (negativeFeedbackTokens.some((token) => normalized.includes(token))) {
    return { type: INTENT_TYPES.FEEDBACK_NEGATIVE, confidence: 0.8 };
  }

  const positiveFeedbackTokens = ['helpful', 'great', 'perfect', 'nice', 'works well'];
  if (positiveFeedbackTokens.some((token) => normalized.includes(token))) {
    return { type: INTENT_TYPES.FEEDBACK_POSITIVE, confidence: 0.7 };
  }

  const complaintTokens = ['problem', 'issue', 'error'];
  if (complaintTokens.some((token) => normalized.includes(token))) {
    return { type: INTENT_TYPES.COMPLAINT, confidence: 0.7 };
  }

  const preferenceSignals = extractPreferenceSignals(normalized);
  if (preferenceSignals.preferredCategories.length > 0) {
    return {
      type: INTENT_TYPES.PREFERENCE_CHANGE,
      confidence: 0.78,
      preferenceSignals,
    };
  }
  if (preferenceSignals.excludedCategories.length > 0) {
    return {
      type: INTENT_TYPES.CONSTRAINT_UPDATE,
      confidence: 0.72,
      preferenceSignals,
    };
  }

  const retrievalTokens = ['show', 'options', 'list', 'items'];
  if (retrievalTokens.some((token) => normalized.startsWith(token) || normalized.includes(` ${token}`))) {
    return { type: INTENT_TYPES.INFORMATION, confidence: 0.65 };
  }

  const continueTokens = ['continue', 'go on', 'keep going', 'carry on'];
  if (continueTokens.some((token) => normalized.startsWith(token))) {
    return { type: INTENT_TYPES.CONTINUE, confidence: 0.8 };
  }

  const questionStarters = ['how', 'what', 'when', 'where', 'why', 'who'];
  const isQuestion = normalized.endsWith('?') || questionStarters.some((starter) => normalized.startsWith(`${starter} `));
  if (isQuestion || normalized.length > 20) {
    return { type: INTENT_TYPES.INFORMATION, confidence: 0.7 };
  }

  return { type: INTENT_TYPES.SMALL_TALK, confidence: 0.4 };
}

export class PreferenceConstraintState {
  constructor(initialState = {}) {
    this.state = {
      preferredCategories: [],
      excludedCategories: [],
      preferredAttributes: [],
      excludedAttributes: [],
      filters: {},
      ...initialState,
    };
  }

  updateFromIntent(intent = {}) {
    const signals = intent.preferenceSignals || {};
    if (!signals) return this.state;
    this.mergeSignals(signals);
    return this.state;
  }

  mergeSignals({ preferredCategories = [], excludedCategories = [], preferredAttributes = [], excludedAttributes = [] }) {
    this.state.preferredCategories = mergeUnique(this.state.preferredCategories, preferredCategories);
    this.state.excludedCategories = mergeUnique(this.state.excludedCategories, excludedCategories);
    this.state.preferredAttributes = mergeUnique(this.state.preferredAttributes, preferredAttributes);
    this.state.excludedAttributes = mergeUnique(this.state.excludedAttributes, excludedAttributes);
  }
}

const mergeUnique = (existing = [], incoming = []) => {
  const map = new Map();
  existing.forEach((entry) => map.set(entry.toLowerCase(), entry));
  incoming.forEach((entry) => {
    if (!entry) return;
    const key = entry.toLowerCase();
    if (!map.has(key)) map.set(key, entry);
  });
  return Array.from(map.values());
};

export const needsEntities = (intentType) =>
  [
    INTENT_TYPES.INFORMATION,
    INTENT_TYPES.COMPLAINT,
    INTENT_TYPES.PREFERENCE_CHANGE,
    INTENT_TYPES.CONSTRAINT_UPDATE,
  ].includes(intentType);

export const decideRenderMode = (healthStatus, intentType) => {
  if (!healthStatus) return 'full';
  if (healthStatus.renderMode === 'text-only') return 'text-only';
  if (healthStatus.renderMode === 'compact') return 'compact';
  if (intentType === INTENT_TYPES.AFFIRMATION) return 'compact';
  return mapStateToRenderMode(healthStatus.mode);
};

export function buildResponse({ intent, items = [], renderMode, health, userFrustrated, contentState, repeatWithChangedConstraints }) {
  const base = {
    intent: intent.type,
    renderMode,
    meta: {
      severity: health?.severity || 'info',
      uiMode: health?.mode || UI_HEALTH_STATES.NORMAL,
    },
    contentState,
    frustration: Boolean(userFrustrated),
  };

  if (userFrustrated) {
    base.message = 'Sorry for the friction. Simplifying the next steps.';
  }

  if (renderMode === 'text-only') {
    return {
      ...base,
      message: intent.type === INTENT_TYPES.AFFIRMATION
        ? 'Acknowledged. Operating in simplified mode.'
        : base.message || 'Simplified response due to UI constraints.',
      items: items.map((item) => ({ id: item.id, title: item.title, summary: item.summary })),
    };
  }

  if (!needsEntities(intent.type)) {
    return {
      ...base,
      message: base.message
        || (intent.type === INTENT_TYPES.AFFIRMATION
          ? 'Understood.'
          : intent.type === INTENT_TYPES.FEEDBACK_POSITIVE
            ? 'Appreciate the feedback.'
            : 'Ready to continue.'),
      items: [],
    };
  }

  if (renderMode === 'compact') {
    return {
      ...base,
      message: base.message
        || (repeatWithChangedConstraints
          ? 'Filters adjusted but results remained similar.'
          : 'Compact results prepared.'),
      items: items.map((item) => ({ id: item.id, title: item.title, summary: item.summary })),
    };
  }

  return {
    ...base,
    message: base.message
      || (repeatWithChangedConstraints
        ? 'Applied the new filters; results are unchanged.'
        : 'Rich results prepared.'),
    items: items.map((item) => ({ id: item.id, title: item.title, summary: item.summary, details: item.details || null })),
  };
}

export const applyPreferencesToItems = (items = [], preferenceState = {}) => {
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
      attrs.some((attr) => {
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
    const score = (item) => {
      const cat = item.category ? normalizeTokens(item.category) : '';
      const attrs = item.attributes || [];
      let val = 0;
      if (cat && preferredCategories.has(cat)) val += 2;
      if (attrs.some((attr) => preferredAttributes.has(normalizeTokens(attr)))) val += 1;
      return val;
    };
    return score(b) - score(a);
  });

  return ranked;
};

export class OffersHistory {
  constructor() {
    this.history = [];
  }

  last() {
    return this.history[this.history.length - 1];
  }

  record(entry) {
    this.history.push({
      ...entry,
      items: (entry.items || []).map((item) => item.id),
      preferenceState: { ...entry.preferenceState },
    });
  }

  detectRepeatWithChanges(items = [], intent, preferenceState) {
    const last = this.last();
    if (!last) return false;
    const currentIds = (items || []).map((item) => item.id).sort();
    const lastIds = [...(last.items || [])].sort();
    const sameItems = currentIds.length === lastIds.length && currentIds.every((id, idx) => id === lastIds[idx]);
    if (!sameItems) return false;
    const intentChanged = intent?.type !== last.intentType;
    const stateChanged = !isStateEqual(last.preferenceState, preferenceState);
    return intentChanged || stateChanged;
  }
}

const isStateEqual = (a = {}, b = {}) => {
  return ['preferredCategories', 'excludedCategories', 'preferredAttributes', 'excludedAttributes'].every((key) => {
    const arrA = (a[key] || []).map(normalizeTokens).sort();
    const arrB = (b[key] || []).map(normalizeTokens).sort();
    return arrA.length === arrB.length && arrA.every((val, idx) => val === arrB[idx]);
  });
};

export async function handleUserTurn({
  userInput,
  uiEvents = [],
  retriever = DEFAULT_RETRIEVER,
  healthMachine,
  preferenceState,
  offersHistory,
}) {
  const machine = healthMachine || new UIHealthStateMachine();
  const prefManager = preferenceState || new PreferenceConstraintState();
  const history = offersHistory || new OffersHistory();

  const health = machine.ingest(uiEvents);
  const intent = detectIntent(userInput);

  const updatedPreferenceState = prefManager.updateFromIntent(intent);
  const userFrustrated = [INTENT_TYPES.FRUSTRATION, INTENT_TYPES.FEEDBACK_NEGATIVE].includes(intent.type);

  let items = [];
  if (needsEntities(intent.type)) {
    const retrieved = await retriever(userInput, { intent, health, preferenceState: updatedPreferenceState });
    items = applyPreferencesToItems(retrieved, updatedPreferenceState);
  }

  const repeatWithChangedConstraints = history.detectRepeatWithChanges(items, intent, updatedPreferenceState);

  const renderMode = decideRenderMode(health, intent.type);
  const fallbackUsed = (needsEntities(intent.type) && items.length === 0) || repeatWithChangedConstraints;
  const contentState = {
    num_results: items.length,
    no_relevant_results: needsEntities(intent.type) && items.length === 0,
    fallback_used: fallbackUsed,
    repeat_with_changed_constraints: repeatWithChangedConstraints,
  };

  const response = buildResponse({ intent, items, renderMode, health, userFrustrated, contentState, repeatWithChangedConstraints });

  history.record({ items, intentType: intent.type, preferenceState: updatedPreferenceState });

  return { intent, health, items, response, preferenceState: updatedPreferenceState, offersHistory: history };
}

export { UI_HEALTH_EVENTS, UI_HEALTH_STATES };
