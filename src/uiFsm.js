export const UI_MODES = {
  NORMAL: "NORMAL",
  DEGRADED_VISUALS: "DEGRADED_VISUALS",
  ERROR: "ERROR",
};

const isCriticalLocal = (localFlags = {}) =>
  localFlags.inputNotReachable ||
  localFlags.keyboardOverlayBlocking ||
  localFlags.uiBroken ||
  (localFlags.uiBroken && localFlags.issues?.some((i) => !i.toLowerCase().includes('nav')));

const isDegradedLocal = (localFlags = {}) => localFlags.issues?.length > 0;

export class UIFiniteStateMachine {
  constructor(initial = UI_MODES.NORMAL) {
    this.state = initial;
  }

  next({ serverHealth = {}, localFlags = {} }) {
    const prev = this.state;
    const target = deriveMode(serverHealth, localFlags);
    const changed = target !== prev;
    this.state = target;
    return { previous: prev, next: target, changed };
  }
}

export const deriveMode = (serverHealth = {}, localFlags = {}) => {
  if (isCriticalLocal(localFlags) || serverHealth.severity === "error") return UI_MODES.ERROR;
  if (serverHealth.degraded_mode || serverHealth.render_text_only || isDegradedLocal(localFlags)) {
    return UI_MODES.DEGRADED_VISUALS;
  }
  return UI_MODES.NORMAL;
};
