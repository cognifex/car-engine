export const UI_HEALTH_STATES = {
  NORMAL: 'normal',
  DEGRADED: 'degraded',
  CRITICAL: 'critical',
};

export const UI_HEALTH_EVENTS = {
  LAYOUT_OVERFLOW: 'LAYOUT_OVERFLOW',
  TOUCH_TARGET_SMALL: 'TOUCH_TARGET_SMALL',
  INPUT_OBSTRUCTED: 'INPUT_OBSTRUCTED',
  RESULTS_NOT_VISIBLE: 'RESULTS_NOT_VISIBLE',
};

const DEFAULT_CONFIG = {
  degradedThreshold: 1,
  criticalThreshold: 2,
  observationWindowMs: 5 * 60 * 1000,
  severityWeights: {
    [UI_HEALTH_EVENTS.LAYOUT_OVERFLOW]: 1,
    [UI_HEALTH_EVENTS.TOUCH_TARGET_SMALL]: 1,
    [UI_HEALTH_EVENTS.INPUT_OBSTRUCTED]: 2,
    [UI_HEALTH_EVENTS.RESULTS_NOT_VISIBLE]: 2,
  },
};

export class UIHealthStateMachine {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = UI_HEALTH_STATES.NORMAL;
    this.history = [];
  }

  ingest(events = []) {
    const stamped = events.map((event) => ({ ...event, ts: event.ts || Date.now() }));
    this.history.push(...stamped);
    this.history = this.history.filter((entry) => Date.now() - entry.ts <= this.config.observationWindowMs);

    const severityScore = this.history.reduce((acc, entry) => {
      const weight = this.config.severityWeights[entry.type] || 1;
      return acc + weight;
    }, 0);

    let targetState = UI_HEALTH_STATES.NORMAL;
    if (severityScore >= this.config.criticalThreshold) {
      targetState = UI_HEALTH_STATES.CRITICAL;
    } else if (severityScore >= this.config.degradedThreshold) {
      targetState = UI_HEALTH_STATES.DEGRADED;
    }

    this.state = targetState;
    return this.status();
  }

  status() {
    const renderMode = mapStateToRenderMode(this.state);
    const severity = mapStateToSeverity(this.state);
    return {
      mode: this.state,
      renderMode,
      severity,
    };
  }
}

export const mapStateToRenderMode = (state) => {
  if (state === UI_HEALTH_STATES.CRITICAL) return 'text-only';
  if (state === UI_HEALTH_STATES.DEGRADED) return 'compact';
  return 'full';
};

export const mapStateToSeverity = (state) => {
  if (state === UI_HEALTH_STATES.CRITICAL) return 'critical';
  if (state === UI_HEALTH_STATES.DEGRADED) return 'warning';
  return 'info';
};
