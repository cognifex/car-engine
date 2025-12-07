import { describe, it, expect, vi } from "vitest";
import { buildGraph } from "../../src/workflows/graph.js";
import { ConversationState } from "../../src/utils/types.js";

const makeStubAgent = (returnValue: any) => ({ run: vi.fn(async () => returnValue) });

describe("graph workflow", () => {
  it("executes nodes in order and aggregates state", async () => {
    const stubs = {
      profiling: makeStubAgent({ knowledge_level: "low", confidence: "low", tone: "casual" }),
      intent: makeStubAgent({ intent: "car_search", fields: [{ key: "budget", value: "15000" }] }),
      router: makeStubAgent({ includeKnowledge: true, includeVisuals: false, includeMatching: true, includeOffers: true }),
      knowledge: makeStubAgent({ explanation: "Kleinwagen sind günstig und sparsam." }),
      profileBuilder: makeStubAgent({ budget: "15000", usage: "Stadt", passengers: "2", experience: "beginner", segmentPrefs: [], powertrainPrefs: [], constraints: [], knowledge_level: "low", confidence: "low" }),
      visual: makeStubAgent({ image_urls: [] }),
      matching: makeStubAgent({ suggestions: [{ model: "Sandero", category: "Kleinwagen", reason: "Günstig" }] }),
      offers: makeStubAgent({ offers: [{ title: "Sandero", model: "Sandero", price: 8000, dealer: "Händler", link: "", image_url: "", location: "", mileage: "", badge: "" }] }),
      front: makeStubAgent({ reply: "Empfehlung: Sandero. Budget 15k?", followUp: "Stadt oder Land?" }),
    } as any;

    const graph = buildGraph(stubs);
    const initial: ConversationState = { userMessage: "Ich suche ein günstiges Auto" };
    const result = await graph.invoke(initial as any);

    expect(stubs.profiling.run).toHaveBeenCalled();
    expect(stubs.intent.run).toHaveBeenCalled();
    expect(stubs.matching.run).toHaveBeenCalled();
    expect(result.response?.reply).toContain("Empfehlung");
    expect(result.matches?.suggestions).toHaveLength(1);
  });
});
