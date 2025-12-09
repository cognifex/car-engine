import { ClientEvent, UIHealth, UIState } from "../utils/types.js";

export type UiHealthPolicyConfig = {
  assetFailureThreshold: number;
  keyboardOverlaySignals?: number;
};

const defaultConfig: UiHealthPolicyConfig = {
  assetFailureThreshold: 4,
  keyboardOverlaySignals: 2,
};

export type UiHealthInputs = {
  clientEvents?: ClientEvent[];
  uiState?: UIState;
  networkUnstable?: boolean;
  agentFailures?: number;
};

export const evaluateUiHealth = (
  inputs: UiHealthInputs,
  config: UiHealthPolicyConfig = defaultConfig,
): UIHealth => {
  const uiState = inputs.uiState || {
    imageFailures: 0,
    failedModels: [],
    networkChanged: false,
    resultsNotVisible: false,
  };

  const imageFailures = uiState.imageFailures || 0;
  const networkChanged = uiState.networkChanged || Boolean(inputs.networkUnstable);
  const resultsNotVisible = uiState.resultsNotVisible;
  const agentFailures = inputs.agentFailures || 0;

  const degradationSignals: string[] = [];
  const errorSignals: string[] = [];

  if (imageFailures >= config.assetFailureThreshold) {
    degradationSignals.push("asset_failures");
  }
  if (networkChanged) {
    degradationSignals.push("network_jitter");
  }
  if (resultsNotVisible) {
    degradationSignals.push("results_not_visible");
  }
  if (agentFailures > 0) {
    degradationSignals.push("agent_failures");
  }

  // Kein harter ERROR nur wegen fehlender Bilder; wir bleiben im Warn-Modus.

  const degraded_mode = degradationSignals.length > 0;
  const render_text_only = imageFailures >= config.assetFailureThreshold;
  const show_banner = degraded_mode || errorSignals.length > 0;
  const severity: UIHealth["severity"] = errorSignals.length > 0 ? "error" : degraded_mode ? "warn" : "info";

  return {
    degraded_mode,
    render_text_only,
    show_banner,
    severity,
    reason: [...degradationSignals, ...errorSignals].join(", ") || undefined,
    note: errorSignals.length > 0 ? "Client meldet unbenutzbare UI – Agentik pausieren." : undefined,
    error: errorSignals.length > 0 ? errorSignals.join(",") : undefined,
    signals: {
      imageFailures,
      networkChanged,
      resultsNotVisible,
      agentFailures,
    },
  };
};
