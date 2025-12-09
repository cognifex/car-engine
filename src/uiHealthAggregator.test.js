import { describe, expect, it, vi } from 'vitest';
import {
  UI_HEALTH_EVENTS,
  UI_HEALTH_STATES,
  UIHealthStateMachine,
  mapStateToRenderMode,
  mapStateToSeverity,
} from './uiHealthAggregator';

describe('UIHealthStateMachine', () => {
  it('stays normal without events', () => {
    const machine = new UIHealthStateMachine();
    const status = machine.ingest([]);
    expect(status.mode).toBe(UI_HEALTH_STATES.NORMAL);
    expect(status.renderMode).toBe('full');
  });

  it('moves to degraded when thresholds reached', () => {
    const machine = new UIHealthStateMachine({ degradedThreshold: 1, criticalThreshold: 3 });
    const status = machine.ingest([{ type: UI_HEALTH_EVENTS.LAYOUT_OVERFLOW }]);
    expect(status.mode).toBe(UI_HEALTH_STATES.DEGRADED);
    expect(status.renderMode).toBe('compact');
  });

  it('moves to critical on severe accumulation', () => {
    const machine = new UIHealthStateMachine({ degradedThreshold: 1, criticalThreshold: 2 });
    const status = machine.ingest([
      { type: UI_HEALTH_EVENTS.INPUT_OBSTRUCTED },
      { type: UI_HEALTH_EVENTS.RESULTS_NOT_VISIBLE },
    ]);
    expect(status.mode).toBe(UI_HEALTH_STATES.CRITICAL);
    expect(status.renderMode).toBe('text-only');
    expect(status.severity).toBe('critical');
  });

  it('maps state to severity consistently', () => {
    expect(mapStateToSeverity(UI_HEALTH_STATES.NORMAL)).toBe('info');
    expect(mapStateToSeverity(UI_HEALTH_STATES.DEGRADED)).toBe('warning');
    expect(mapStateToSeverity(UI_HEALTH_STATES.CRITICAL)).toBe('critical');
  });

  it('respects observation window when ingesting events', () => {
    vi.useFakeTimers();
    const machine = new UIHealthStateMachine({ observationWindowMs: 1000 });
    machine.ingest([{ type: UI_HEALTH_EVENTS.LAYOUT_OVERFLOW, ts: Date.now() - 1500 }]);
    const status = machine.ingest([{ type: UI_HEALTH_EVENTS.TOUCH_TARGET_SMALL }]);
    expect(status.mode).toBe(UI_HEALTH_STATES.DEGRADED);
    vi.useRealTimers();
  });
});

describe('mapStateToRenderMode', () => {
  it('returns correct render mode per state', () => {
    expect(mapStateToRenderMode(UI_HEALTH_STATES.NORMAL)).toBe('full');
    expect(mapStateToRenderMode(UI_HEALTH_STATES.DEGRADED)).toBe('compact');
    expect(mapStateToRenderMode(UI_HEALTH_STATES.CRITICAL)).toBe('text-only');
  });
});
