import { describe, it, expect } from "vitest";
import { evaluateRouting } from "./routingPolicy.js";

describe("routingPolicy", () => {
  it("enables strict matching when results exist and no clarification", () => {
    const decision = evaluateRouting({ intent: { intent: "informational" }, offerCount: 3, needsClarification: false });
    expect(decision.content_state.strict_matching).toBe(true);
    expect(decision.route.strictOffers).toBe(true);
  });

  it("disables strict matching when clarification required", () => {
    const decision = evaluateRouting({ intent: { intent: "needs_clarification" }, offerCount: 0, needsClarification: true });
    expect(decision.content_state.clarification_required).toBe(true);
    expect(decision.route.strictOffers).toBe(false);
  });

  it("marks fallback when relevance low", () => {
    const decision = evaluateRouting({ intent: { intent: "informational" }, offerCount: 2, relevanceScore: 0 });
    expect(decision.content_state.fallback_used).toBe(true);
  });

  it("keeps clarification off for off-domain/smalltalk", () => {
    const decision = evaluateRouting({ intent: { intent: "small_talk" }, allowOffers: false, offDomain: true });
    expect(decision.content_state.clarification_required).toBe(false);
    expect(decision.content_state.fallback_used).toBe(false);
    expect(decision.content_state.has_results).toBe(false);
  });
});
