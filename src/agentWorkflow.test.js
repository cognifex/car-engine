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
} from './agentWorkflow';
import { UIHealthStateMachine } from './uiHealthAggregator';

describe('intent detection', () => {
  it('detects affirmation phrases', () => {
    const intent = detectIntent('ok');
    expect(intent.type).toBe(INTENT_TYPES.AFFIRMATION);
  });

  it('detects complaints', () => {
    const intent = detectIntent('this is not working');
    expect(intent.type).toBe(INTENT_TYPES.COMPLAINT);
  });

  it('classifies questions as information', () => {
    const intent = detectIntent('How does this work?');
    expect(intent.type).toBe(INTENT_TYPES.INFORMATION);
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
    });
    expect(response.items).toHaveLength(0);
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
});
