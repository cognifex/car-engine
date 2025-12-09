import { describe, expect, it } from 'vitest';
import { buildSnapshot, evaluateUiState } from './uiState';

describe('uiState evaluation', () => {
  const viewportHeight = 700;
  const viewportWidth = 360;

  it('detects missing core elements as uiBroken', () => {
    const { state } = evaluateUiState(buildSnapshot({ viewportHeight, viewportWidth }));
    expect(state.uiBroken).toBe(true);
    expect(state.issues[0]).toContain('Fehlende Kern-Elemente');
  });

  it('flags invisible input as broken', () => {
    const snap = buildSnapshot({
      mainRect: { top: 0, height: 600, width: 360 },
      inputRect: { top: 620, bottom: 660, height: 0, width: 200 },
      navRect: { top: 660, bottom: 700, height: 44 },
      chatRect: { top: 0, bottom: 600, height: 600 },
      viewportHeight,
      viewportWidth,
      visualViewportHeight: 700,
      visibility: { main: true, input: false, nav: true, chat: true },
      focusable: { input: true },
    });
    const { state } = evaluateUiState(snap);
    expect(state.uiBroken).toBe(true);
    expect(state.issues.join(' ')).toContain('nicht sichtbar');
  });

  it('flags input not reachable when outside viewport', () => {
    const snap = buildSnapshot({
      mainRect: { top: 0 },
      inputRect: { top: 680, bottom: 750, height: 42 },
      navRect: { top: 640, bottom: 700 },
      chatRect: { top: 0, bottom: 600 },
      viewportHeight,
      viewportWidth,
      visualViewportHeight: 700,
    });
    const { state } = evaluateUiState(snap);
    expect(state.inputNotReachable).toBe(true);
  });

  it('marks input as not reachable when not focusable', () => {
    const snap = buildSnapshot({
      mainRect: { top: 0, height: 700 },
      inputRect: { top: 500, bottom: 560, height: 44 },
      navRect: { top: 640, bottom: 700 },
      chatRect: { top: 0, bottom: 480, height: 480 },
      viewportHeight,
      viewportWidth,
      visualViewportHeight: 700,
      visibility: { main: true, input: true, nav: true, chat: true },
      focusable: { input: false },
    });
    const { state } = evaluateUiState(snap);
    expect(state.inputNotReachable).toBe(true);
  });

  it('detects layout shift greater than threshold', () => {
    const previous = { positions: { inputY: 200 } };
    const snap = buildSnapshot({
      mainRect: { top: 0 },
      inputRect: { top: 260, bottom: 300, height: 44 },
      navRect: { top: 600, bottom: 650 },
      chatRect: { top: 0, bottom: 500 },
      viewportHeight,
      viewportWidth,
      visualViewportHeight: 700,
    });
    const { state } = evaluateUiState(snap, previous);
    expect(state.layoutShiftDetected).toBe(true);
  });

  it('detects keyboard overlay blocking the input', () => {
    const snap = buildSnapshot({
      mainRect: { top: 0 },
      inputRect: { top: 620, bottom: 690, height: 44 },
      navRect: { top: 640, bottom: 690 },
      chatRect: { top: 0, bottom: 550 },
      viewportHeight,
      viewportWidth,
      visualViewportHeight: 500,
    });
    const { state } = evaluateUiState(snap, { positions: {} });
    expect(state.keyboardOverlayBlocking).toBe(true);
  });

  it('detects containment/zero-height bugs', () => {
    const snap = buildSnapshot({
      mainRect: { top: 0, height: 0 },
      inputRect: { top: 620, bottom: 690, height: 44 },
      navRect: { top: 640, bottom: 690 },
      chatRect: { top: 0, bottom: 0, height: 0 },
      viewportHeight,
      viewportWidth,
      visualViewportHeight: 700,
    });
    const { state } = evaluateUiState(snap, { positions: {} });
    expect(state.uiBroken).toBe(true);
    expect(state.issues.join(' ')).toContain('Containment');
  });

  it('detects bottom navigation obstruction', () => {
    const snap = buildSnapshot({
      mainRect: { top: 0 },
      inputRect: { top: 560, bottom: 610, height: 44 },
      navRect: { top: 660, bottom: 705 },
      chatRect: { top: 0, bottom: 500 },
      viewportHeight: 700,
      viewportWidth,
      visualViewportHeight: 680,
    });
    const { state } = evaluateUiState(snap, { positions: {} });
    expect(state.viewportObstructed).toBe(true);
  });

  it('flags zoom/scale drift as layout shift risk', () => {
    const snap = buildSnapshot({
      mainRect: { top: 0 },
      inputRect: { top: 500, bottom: 560, height: 44 },
      navRect: { top: 620, bottom: 670 },
      chatRect: { top: 0, bottom: 480 },
      viewportHeight,
      viewportWidth,
      visualViewportHeight: 500,
      viewportScale: 1.2,
    });
    const { state } = evaluateUiState(snap, { positions: {} });
    expect(state.layoutShiftDetected).toBe(true);
    expect(state.issues.join(' ')).toContain('Zoom/Scaling');
  });
});
