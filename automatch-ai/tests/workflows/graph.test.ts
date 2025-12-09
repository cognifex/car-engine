import { describe, it, expect } from "vitest";
import { buildGraph } from "../../src/workflows/graph.js";

const baseState = (userMessage: string) =>
  ({
    userMessage,
    history: [],
    debugLogs: [],
    clientEvents: [],
  } as any);

describe("graph workflow", () => {
  it("applies constraint updates before routing", async () => {
    const graph = buildGraph();
    const result = await graph.invoke(baseState("kein elektro"));

    expect(result.offers?.some((o: any) => /Elektro/i.test(o.badge) || /Elektro/i.test(o.model))).toBe(false);
    expect(result.content_state?.no_relevant_results).toBe(false);
  });

  it("flags repeat sets when intent/state changes and avoids re-showing identical offers", async () => {
    const graph = buildGraph();
    const first = await graph.invoke({
      ...baseState("zeige optionen"),
      preferenceState: {
        product: { preferredCategories: ["jeep"], excludedCategories: [], preferredAttributes: [], excludedAttributes: [], useCases: [] },
        conversation: {},
        style: {},
      },
    });
    expect(first.offers?.length).toBeGreaterThan(0);

    const second = await graph.invoke({
      ...baseState("hast du noch was anderes"),
      preferenceState: first.preferenceState,
      offersHistory: first.offersHistory,
    });

    expect(second.content_state?.repeat_with_changed_constraints).toBe(true);
    expect(second.content_state?.fallback_used).toBe(true);
    expect(second.offers?.length || 0).toBe(0);
  });

  it("adds frustration-aware evaluation and recovery hints", async () => {
    const graph = buildGraph();
    const result = await graph.invoke(baseState("das funktioniert nicht, bitte im textmodus"));

    expect(result.intent?.frustration).toBe(true);
    expect(result.evaluation?.severity).toBe("warn");
    expect(result.ui_health?.render_text_only).toBeTypeOf("boolean");
  });

  it("stays in onboarding/plan mode for meta communication without structured request", async () => {
    const graph = buildGraph();
    const result = await graph.invoke(baseState("stell mir bitte erst fragen, ich kenne mich nicht aus"));

    expect(result.offers?.length || 0).toBe(0);
    expect(result.response?.reply.toLowerCase()).toContain("plan");
    expect(result.content_state?.clarification_required).toBe(true);
  });
});
