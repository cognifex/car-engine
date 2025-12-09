import { describe, it, expect } from "vitest";
import { runPipeline } from "../../src/workflows/pipeline.js";

describe("pipeline integration", () => {
  it("returns offers and content state for informational query", async () => {
    const result = await runPipeline("zeige jeep modelle");

    expect(["informational", "preference_change", "constraint_update"]).toContain(result.intent?.intent);
    expect(result.offers?.length).toBeGreaterThan(0);
    expect(result.content_state?.has_results).toBe(true);
  });

  it("propagates offers history to avoid silent repeats", async () => {
    const first = await runPipeline("zeige optionen", [], {
      preferenceState: {
        product: { preferredCategories: ["jeep"], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] },
        conversation: {},
        style: {},
      } as any,
    });
    const second = await runPipeline(
      "noch was anderes",
      [],
      {
        preferenceState: first.preferenceState as any,
        offersHistory: first.offersHistory as any,
      },
    );

    expect(second.content_state?.repeat_with_changed_constraints).toBe(true);
    expect(second.offers?.length || 0).toBe(0);
  });
});
