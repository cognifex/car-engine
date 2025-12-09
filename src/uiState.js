export const DEFAULT_UI_FLAGS = {
  uiBroken: false,
  layoutShiftDetected: false,
  inputNotReachable: false,
  viewportObstructed: false,
  keyboardOverlayBlocking: false,
  issues: [],
  lastCheck: null,
};

const LAYOUT_SHIFT_THRESHOLD = 40; // px
const KEYBOARD_OVERLAY_DELTA = 150; // px difference between viewport and visualViewport

export function evaluateUiState(current, previous = {}) {
  const base = { ...DEFAULT_UI_FLAGS };

  if (!current) return base;

  const { elements = {}, viewportHeight, visualViewportHeight } = current;
  const issues = [];

  const missing = ['main', 'input', 'nav', 'chat'].filter((key) => !elements[key]);
  if (missing.length > 0) {
    base.uiBroken = true;
    issues.push(`Fehlende Kern-Elemente: ${missing.join(', ')}`);
  }

  if (elements.input) {
    const { top, bottom, height } = elements.input;
    if (top < 0 || bottom > (visualViewportHeight || viewportHeight)) {
      base.inputNotReachable = true;
      issues.push('Haupteingabe ist nicht im Viewport erreichbar');
    }
    if (height < 40) {
      issues.push('Touch-Zone der Haupteingabe unter 44px');
    }
  }

  if (elements.nav && visualViewportHeight) {
    if (elements.nav.bottom > visualViewportHeight - 4) {
      base.viewportObstructed = true;
      issues.push('Bottom-Navigation wird abgeschnitten');
    }
  }

  if (visualViewportHeight && viewportHeight) {
    const keyboardVisible = viewportHeight - visualViewportHeight > KEYBOARD_OVERLAY_DELTA;
    if (keyboardVisible && elements.input && elements.input.bottom > visualViewportHeight) {
      base.keyboardOverlayBlocking = true;
      issues.push('On-Screen-Keyboard überdeckt das Eingabefeld');
    }
  }

  if (previous.positions && current.positions) {
    const shift = Math.abs((current.positions.inputY || 0) - (previous.positions.inputY || 0));
    if (shift > LAYOUT_SHIFT_THRESHOLD) {
      base.layoutShiftDetected = true;
      issues.push(`Layout-Shift von ${Math.round(shift)}px erkannt`);
    }
  }

  if (current.touchTargets?.length) {
    const tinyTarget = current.touchTargets.find((t) => t.height < 44 || t.width < 44);
    if (tinyTarget) {
      issues.push(`Touch-Target '${tinyTarget.name}' ist kleiner als 44px`);
    }
  }

  const snapshot = {
    positions: {
      inputY: elements.input?.top,
      navY: elements.nav?.top,
      chatY: elements.chat?.top,
    },
  };

  return {
    state: {
      ...base,
      issues,
      lastCheck: Date.now(),
    },
    snapshot,
  };
}

export function buildSnapshot({
  mainRect,
  inputRect,
  navRect,
  chatRect,
  viewportHeight,
  viewportWidth,
  visualViewportHeight,
  touchTargets = [],
}) {
  return {
    elements: {
      main: mainRect,
      input: inputRect,
      nav: navRect,
      chat: chatRect,
    },
    viewportHeight,
    viewportWidth,
    visualViewportHeight,
    touchTargets,
    positions: {
      inputY: inputRect?.top,
      navY: navRect?.top,
      chatY: chatRect?.top,
    },
  };
}
