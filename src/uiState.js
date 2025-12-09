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
const MIN_TOUCH_TARGET = 44; // px touch guidelines
const ZOOM_DRIFT_THRESHOLD = 0.05; // tolerate minor zoom differences

export function evaluateUiState(current, previous = {}) {
  const base = { ...DEFAULT_UI_FLAGS };

  if (!current) return base;

  const {
    elements = {},
    viewportHeight,
    viewportWidth,
    visualViewportHeight,
    visibility = {},
    focusable = {},
    safeAreaInsets = {},
    viewportScale,
    navVisible: navVisibleFromSnapshot,
  } = current;
  const issues = [];
  const navVisible = typeof navVisibleFromSnapshot === 'boolean'
    ? navVisibleFromSnapshot
    : Boolean(elements.nav && elements.nav.width > 0 && elements.nav.height > 0);
  const navExpected = typeof viewportWidth === 'number' ? viewportWidth < 768 : false; // nav only rendered on small screens

  const requiredElements = navExpected ? ['main', 'input', 'nav', 'chat'] : ['main', 'input', 'chat'];
  const missing = requiredElements.filter((key) => !elements[key]);
  if (missing.length > 0) { 
    const criticalMissing = missing.filter((key) => key !== 'nav'); // nav missing alone should not brick desktop
    if (criticalMissing.length > 0) {
      base.uiBroken = true;
    }
    issues.push(`Fehlende Kern-Elemente: ${missing.join(', ')}`);
  }

  const invisible = Object.entries(visibility)
    .filter(([key, val]) => val === false && requiredElements.includes(key))
    .map(([key]) => key);
  if (invisible.length > 0) {
    const criticalInvisible = invisible.filter((key) => key !== 'nav');
    if (criticalInvisible.length > 0) {
      base.uiBroken = true;
    }
    issues.push(`Kern-Elemente nicht sichtbar/renderbar: ${invisible.join(', ')}`);
  }

  if (elements.input) {
    const { top = 0, bottom = 0, height = 0 } = elements.input;
    if (focusable.input === false) {
      base.inputNotReachable = true;
      issues.push('Haupteingabe ist nicht fokussierbar');
    }
    if (top < 0 || bottom > (visualViewportHeight || viewportHeight)) {
      base.inputNotReachable = true;
      issues.push('Haupteingabe ist nicht im Viewport erreichbar');
    }
    if (height < 40) {
      issues.push('Touch-Zone der Haupteingabe unter 44px');
    }
  }

  if (navExpected && navVisible && elements.nav && visualViewportHeight) {
    const safeBottom = Math.max(0, safeAreaInsets.bottom || 0);
    if (elements.nav.bottom > visualViewportHeight - safeBottom - 4) {
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

    const zoomDelta = Math.abs((viewportScale || 1) - 1);
    if (zoomDelta > ZOOM_DRIFT_THRESHOLD) {
      base.layoutShiftDetected = true;
      issues.push(`Zoom/Scaling aktiv (${(viewportScale || 1).toFixed(2)}x)`);
    }
  }

  if (previous.positions && current.positions) {
    const shiftInput = Math.abs((current.positions.inputY || 0) - (previous.positions.inputY || 0));
    if (shiftInput > LAYOUT_SHIFT_THRESHOLD) {
      base.layoutShiftDetected = true;
      issues.push(`Layout-Shift von ${Math.round(shiftInput)}px erkannt`);
    }
    const shiftNav = Math.abs((current.positions.navY || 0) - (previous.positions.navY || 0));
    if (shiftNav > LAYOUT_SHIFT_THRESHOLD && !base.layoutShiftDetected) {
      base.layoutShiftDetected = true;
      issues.push(`Layout-Shift (Navigation) von ${Math.round(shiftNav)}px erkannt`);
    }
  }

  if (navExpected && navVisible && current.touchTargets?.length) {
    const tinyTarget = current.touchTargets.find(
      (t) => t.height < MIN_TOUCH_TARGET || t.width < MIN_TOUCH_TARGET
    );
    if (tinyTarget) {
      issues.push(`Touch-Target '${tinyTarget.name}' ist kleiner als 44px`);
    }
  }

  if (elements.main?.height === 0 || elements.chat?.height === 0) {
    base.uiBroken = true;
    issues.push('Layout/Containment-Bug: Hauptcontainer hat Höhe 0');
  }

  if (viewportWidth && viewportWidth < MIN_TOUCH_TARGET * 2 && elements.input) {
    base.viewportObstructed = true;
    issues.push('Viewport zu schmal für sichere Touch-Zonen');
  }

  const safeBottom = Math.max(0, safeAreaInsets.bottom || 0);
  if (safeBottom > 0 && elements.chat && elements.chat.bottom > (visualViewportHeight || viewportHeight) - safeBottom) {
    base.viewportObstructed = true;
    issues.push('Safe-Area-Inset unten nicht freigehalten');
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
  visibility = {},
  focusable = {},
  safeAreaInsets = {},
  viewportScale = 1,
  navVisible = false,
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
    visibility,
    focusable,
    safeAreaInsets,
    viewportScale,
    positions: {
      inputY: inputRect?.top,
      navY: navRect?.top,
      chatY: chatRect?.top,
    },
    navVisible,
  };
}
