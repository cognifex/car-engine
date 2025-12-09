import { mapStateToRenderMode, UIHealthStateMachine, UI_HEALTH_EVENTS, UI_HEALTH_STATES } from './uiHealthAggregator';

export const INTENT_TYPES = {
  INFORMATION: 'information',
  AFFIRMATION: 'affirmation',
  CONTINUE: 'continue',
  COMPLAINT: 'complaint',
  SMALL_TALK: 'small_talk',
};

const DEFAULT_RETRIEVER = async (query) => [
  { id: 'item-1', title: 'Item A', summary: `Result for ${query}` },
  { id: 'item-2', title: 'Item B', summary: `Alternative for ${query}` },
];

export function detectIntent(input = '') {
  const normalized = input.toLowerCase().trim();
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

  const complaintTokens = ['not working', 'problem', 'issue', 'broken', 'fail', 'error'];
  if (complaintTokens.some((token) => normalized.includes(token))) {
    return { type: INTENT_TYPES.COMPLAINT, confidence: 0.75 };
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

export const needsEntities = (intentType) => [INTENT_TYPES.INFORMATION, INTENT_TYPES.COMPLAINT].includes(intentType);

export const decideRenderMode = (healthStatus, intentType) => {
  if (!healthStatus) return 'full';
  if (healthStatus.renderMode === 'text-only') return 'text-only';
  if (healthStatus.renderMode === 'compact') return 'compact';
  if (intentType === INTENT_TYPES.AFFIRMATION) return 'compact';
  return mapStateToRenderMode(healthStatus.mode);
};

export function buildResponse({ intent, items = [], renderMode, health }) {
  const base = {
    intent: intent.type,
    renderMode,
    meta: {
      severity: health?.severity || 'info',
      uiMode: health?.mode || UI_HEALTH_STATES.NORMAL,
    },
  };

  if (renderMode === 'text-only') {
    return {
      ...base,
      message: intent.type === INTENT_TYPES.AFFIRMATION
        ? 'Acknowledged. Operating in simplified mode.'
        : 'Simplified response due to UI constraints.',
      items: items.map((item) => ({ id: item.id, title: item.title, summary: item.summary })),
    };
  }

  if (!needsEntities(intent.type)) {
    return {
      ...base,
      message: intent.type === INTENT_TYPES.AFFIRMATION ? 'Understood.' : 'Ready to continue.',
      items: [],
    };
  }

  if (renderMode === 'compact') {
    return {
      ...base,
      message: 'Compact results prepared.',
      items: items.map((item) => ({ id: item.id, title: item.title, summary: item.summary })),
    };
  }

  return {
    ...base,
    message: 'Rich results prepared.',
    items: items.map((item) => ({ id: item.id, title: item.title, summary: item.summary, details: item.details || null })),
  };
}

export async function handleUserTurn({
  userInput,
  uiEvents = [],
  retriever = DEFAULT_RETRIEVER,
  healthMachine,
}) {
  const machine = healthMachine || new UIHealthStateMachine();
  const health = machine.ingest(uiEvents);
  const intent = detectIntent(userInput);

  let items = [];
  if (needsEntities(intent.type)) {
    items = await retriever(userInput, { intent, health });
  }

  const renderMode = decideRenderMode(health, intent.type);
  const response = buildResponse({ intent, items, renderMode, health });

  return { intent, health, items, response };
}

export { UI_HEALTH_EVENTS, UI_HEALTH_STATES };
