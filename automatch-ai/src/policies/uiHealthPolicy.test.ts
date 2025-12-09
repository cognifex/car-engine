import { describe, it, expect } from "vitest";
import { evaluateUiHealth } from "./uiHealthPolicy.js";

describe("uiHealthPolicy", () => {
  it("keeps normal mode when no signals", () => {
    const health = evaluateUiHealth({ uiState: { imageFailures: 0, failedModels: [], networkChanged: false, resultsNotVisible: false } });
    expect(health.degraded_mode).toBe(false);
    expect(health.render_text_only).toBe(false);
  });

  it("flags degraded visuals on asset failures", () => {
    const health = evaluateUiHealth({ uiState: { imageFailures: 3, failedModels: [], networkChanged: false, resultsNotVisible: false } });
    expect(health.degraded_mode).toBe(true);
    expect(health.render_text_only).toBe(true);
    expect(health.reason).toContain("asset_failures");
  });

  it("flags error when results not visible and assets failing", () => {
    const health = evaluateUiHealth({ uiState: { imageFailures: 2, failedModels: [], networkChanged: true, resultsNotVisible: true } });
    expect(health.severity).toBe("error");
    expect(health.error).toContain("ui_unusable");
  });
});
