import { describe, it, expect, vi } from "vitest";
import { buildGraph } from "../../src/workflows/graph.js";
import { ConversationState } from "../../src/utils/types.js";

const stub = <T>(value: T) => ({ run: vi.fn(async () => value) });

describe("pipeline integration", () => {
  it("flows through agents and produces front response", async () => {
    const agents = {
      profiling: stub({ knowledge_level: "low", confidence: "low", tone: "casual" }),
      intent: stub({ intent: "car_search", fields: [{ key: "budget", value: "10000" }] }),
      router: stub({ includeKnowledge: true, includeVisuals: false, includeMatching: true, includeOffers: true }),
      knowledge: stub({ explanation: "Günstige Kleinwagen sind wartungsarm." }),
      profileBuilder: stub({ budget: "10000", usage: "Stadt", passengers: "2", experience: "beginner", segmentPrefs: [], powertrainPrefs: [], constraints: [], knowledge_level: "low", confidence: "low" }),
      visual: stub({ image_urls: ["https://example.com/a.png"] }),
      matching: stub({ suggestions: [{ model: "Fabia", category: "Kleinwagen", reason: "Günstig" }] }),
      offers: stub({ offers: [{ title: "Fabia", model: "Fabia", price: 10000, dealer: "Händler", link: "", image_url: "", location: "", mileage: "", badge: "" }] }),
      front: stub({ reply: "Empfehlung: Fabia passt ins Budget.", followUp: "Stadt oder Überland?" }),
    } as any;

    const graph = buildGraph(agents);
    const result = await graph.invoke({ userMessage: "Ich suche ein günstiges Auto" } as any);

    expect(agents.profiling.run).toHaveBeenCalledTimes(1);
    expect(agents.intent.run).toHaveBeenCalledTimes(1);
    expect(result.intent?.intent).toBe("car_search");
    expect(result.matches?.suggestions?.length).toBeLessThanOrEqual(3);
    expect(result.response?.reply).toContain("Empfehlung");
    expect(result.response?.followUp?.length).toBeGreaterThan(0);
  });
});
