import { describe, expect, it, vi } from 'vitest';
import {
  INTENT_TYPES,
  detectIntent,
  needsEntities,
  decideRenderMode,
  buildResponse,
  handleUserTurn,
  UI_HEALTH_EVENTS,
  UI_HEALTH_STATES,
  PreferenceConstraintState,
  applyPreferencesToItems,
  OffersHistory,
} from './agentWorkflow';
import { UIHealthStateMachine } from './uiHealthAggregator';

describe('intent detection', () => {
  it('detects affirmation phrases', () => {
    const intent = detectIntent('ok');
    expect(intent.type).toBe(INTENT_TYPES.AFFIRMATION);
  });

  it('detects complaints', () => {
    const intent = detectIntent('this is not working');
    expect(intent.type).toBe(INTENT_TYPES.FRUSTRATION);
  });

  it('classifies questions as information', () => {
    const intent = detectIntent('How does this work?');
    expect(intent.type).toBe(INTENT_TYPES.INFORMATION);
  });

  it('detects preference change intent', () => {
    const intent = detectIntent('prefer type a over type b');
    expect(intent.type).toBe(INTENT_TYPES.PREFERENCE_CHANGE);
    expect(intent.preferenceSignals.preferredCategories).toContain('type a');
  });

  it('detects constraint updates', () => {
    const intent = detectIntent('no type b items');
    expect(intent.type).toBe(INTENT_TYPES.CONSTRAINT_UPDATE);
    expect(intent.preferenceSignals.excludedCategories).toContain('type b items');
  });

  it('detects frustration intent', () => {
    const intent = detectIntent('you are useless and broken');
    expect(intent.type).toBe(INTENT_TYPES.FRUSTRATION);
  });
});

describe('routing decisions', () => {
  it('avoids entity retrieval for affirmations', () => {
    expect(needsEntities(INTENT_TYPES.AFFIRMATION)).toBe(false);
  });

  it('forces compact for affirmation even when healthy', () => {
    const renderMode = decideRenderMode({ mode: UI_HEALTH_STATES.NORMAL, renderMode: 'full' }, INTENT_TYPES.AFFIRMATION);
    expect(renderMode).toBe('compact');
  });

  it('keeps text-only when health is critical', () => {
    const renderMode = decideRenderMode({ mode: UI_HEALTH_STATES.CRITICAL, renderMode: 'text-only' }, INTENT_TYPES.INFORMATION);
    expect(renderMode).toBe('text-only');
  });
});

describe('response builder', () => {
  const healthy = { severity: 'info', mode: UI_HEALTH_STATES.NORMAL };
  it('returns simplified response in text-only', () => {
    const response = buildResponse({
      intent: { type: INTENT_TYPES.INFORMATION },
      items: [{ id: '1', title: 'Item 1', summary: 'A' }],
      renderMode: 'text-only',
      health: healthy,
      contentState: { num_results: 1 },
    });
    expect(response.renderMode).toBe('text-only');
    expect(response.items).toHaveLength(1);
  });

  it('omits items for non-entity intents', () => {
    const response = buildResponse({
      intent: { type: INTENT_TYPES.AFFIRMATION },
      items: [{ id: '1', title: 'Item 1' }],
      renderMode: 'compact',
      health: healthy,
      contentState: { num_results: 0 },
    });
    expect(response.items).toHaveLength(0);
  });

  it('injects apology when frustrated', () => {
    const response = buildResponse({
      intent: { type: INTENT_TYPES.INFORMATION },
      items: [],
      renderMode: 'compact',
      health: healthy,
      userFrustrated: true,
      contentState: { num_results: 0 },
    });
    expect(response.message).toContain('Sorry');
  });
});

describe('preference state management', () => {
  it('merges preferred and excluded categories over multiple turns', () => {
    const manager = new PreferenceConstraintState();
    manager.updateFromIntent(detectIntent('prefer type a over type b'));
    manager.updateFromIntent(detectIntent('no type c items'));

    expect(manager.state.preferredCategories).toContain('type a');
    expect(manager.state.excludedCategories).toEqual(expect.arrayContaining(['type b', 'type c items']));
  });

  it('filters items by exclusion and preference ranking', () => {
    const state = {
      preferredCategories: ['type a'],
      excludedCategories: ['type c'],
      preferredAttributes: [],
      excludedAttributes: [],
    };
    const items = [
      { id: '1', title: 'Item 1', category: 'type c' },
      { id: '2', title: 'Item 2', category: 'type a' },
      { id: '3', title: 'Item 3', category: 'type b' },
    ];

    const ranked = applyPreferencesToItems(items, state);
    expect(ranked.map((i) => i.id)).toEqual(['2', '3']);
  });
});

describe('workflow integration', () => {
  it('returns visual results on healthy UI for informational input', async () => {
    const machine = new UIHealthStateMachine();
    const retriever = vi.fn(async () => [{ id: 'r1', title: 'Result', summary: 'Summary' }]);
    const { response } = await handleUserTurn({
      userInput: 'What options are available?',
      uiEvents: [],
      retriever,
      healthMachine: machine,
    });
    expect(retriever).toHaveBeenCalled();
    expect(response.renderMode).toBe('full');
    expect(response.items).toHaveLength(1);
  });

  it('returns text-only when health is critical', async () => {
    const machine = new UIHealthStateMachine({ criticalThreshold: 1 });
    const { response } = await handleUserTurn({
      userInput: 'What options are available?',
      uiEvents: [{ type: UI_HEALTH_EVENTS.RESULTS_NOT_VISIBLE }],
      healthMachine: machine,
    });
    expect(response.renderMode).toBe('text-only');
    expect(response.items).toHaveLength(2);
  });

  it('skips retrieval for affirmations regardless of health', async () => {
    const retriever = vi.fn();
    const { response } = await handleUserTurn({
      userInput: 'ok',
      uiEvents: [{ type: UI_HEALTH_EVENTS.LAYOUT_OVERFLOW }],
      retriever,
    });
    expect(retriever).not.toHaveBeenCalled();
    expect(response.items).toHaveLength(0);
  });

  it('applies constraints before returning items', async () => {
    const prefManager = new PreferenceConstraintState();
    prefManager.updateFromIntent(detectIntent('no type b items'));
    const retriever = vi.fn(async () => [
      { id: '1', title: 'Item 1', category: 'type a' },
      { id: '2', title: 'Item 2', category: 'type b' },
    ]);

    const { response } = await handleUserTurn({
      userInput: 'show options',
      uiEvents: [],
      retriever,
      preferenceState: prefManager,
    });

    expect(response.items).toHaveLength(1);
    expect(response.items[0].id).toBe('1');
    expect(response.contentState.no_relevant_results).toBe(false);
  });

  it('flags no results when constraints exclude all matches', async () => {
    const prefManager = new PreferenceConstraintState();
    prefManager.updateFromIntent(detectIntent('no type a items'));
    const retriever = vi.fn(async () => [
      { id: '1', title: 'Item 1', category: 'type a' },
    ]);

    const { response } = await handleUserTurn({
      userInput: 'show anything',
      retriever,
      preferenceState: prefManager,
    });

    expect(response.items).toHaveLength(0);
    expect(response.contentState.no_relevant_results).toBe(true);
    expect(response.contentState.fallback_used).toBe(true);
  });

  it('detects repeated offers when state changed', async () => {
    const history = new OffersHistory();
    const prefManager = new PreferenceConstraintState();
    const retriever = vi.fn(async () => [
      { id: '1', title: 'Item 1', category: 'type a' },
    ]);

    await handleUserTurn({ userInput: 'show options', retriever, preferenceState: prefManager, offersHistory: history });
    prefManager.updateFromIntent(detectIntent('prefer type a'));
    const { response } = await handleUserTurn({
      userInput: 'prefer type a',
      retriever,
      preferenceState: prefManager,
      offersHistory: history,
    });

    expect(response.contentState.repeat_with_changed_constraints).toBe(true);
    expect(response.message).toContain('filters');
  });

  it('adds apology when user is frustrated', async () => {
    const { response } = await handleUserTurn({ userInput: 'you are broken and useless' });
    expect(response.frustration).toBe(true);
    expect(response.message).toContain('Sorry');
  });
});
