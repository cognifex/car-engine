import { describe, it, expect } from 'vitest';
import { deriveMode, UI_MODES } from './uiFsm';

describe('UI FSM deriveMode', () => {
  it('stays normal without signals', () => {
    expect(deriveMode({}, {})).toBe(UI_MODES.NORMAL);
  });

  it('enters degraded on server degraded flag', () => {
    expect(deriveMode({ degraded_mode: true }, {})).toBe(UI_MODES.DEGRADED_VISUALS);
  });

  it('enters error on critical local flags', () => {
    expect(deriveMode({}, { uiBroken: true })).toBe(UI_MODES.ERROR);
  });
});
