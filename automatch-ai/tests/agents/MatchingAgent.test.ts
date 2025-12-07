import { describe, it, expect } from "vitest";
import { MatchingAgent } from "../../src/agents/MatchingAgent.js";
import { createMockModel } from "../testUtils/mockModel.js";
import { matchSchema } from "../../src/utils/types.js";
import path from "path";

const promptPath = path.resolve(process.cwd(), "src", "prompts", "matching.md");
const makeAgent = (handler: any) => new MatchingAgent(createMockModel(handler), promptPath);

describe("MatchingAgent", () => {
  it("returns max three suggestions with required fields", async () => {
    const suggestions = [
      { model: "Dacia Sandero", category: "Kleinwagen", reason: "Sehr günstig" },
      { model: "Skoda Fabia", category: "Kleinwagen", reason: "Sparsam" },
      { model: "Toyota Aygo", category: "City", reason: "Kompakt" },
    ];
    const agent = makeAgent(() => ({ suggestions }));
    const result = await agent.run({ intent: { intent: "car_search", fields: [] } });
    expect(() => matchSchema.parse(result)).not.toThrow();
    expect(result.suggestions).toHaveLength(3);
    result.suggestions.forEach((s) => {
      expect(s.model).toBeTruthy();
      expect(s.category).toBeTruthy();
      expect(s.reason).toBeTruthy();
    });
  });

  it("does not include user echo or greetings", async () => {
    const agent = makeAgent(() => ({ suggestions: [{ model: "Clio", category: "Kleinwagen", reason: "Günstig" }] }));
    const result = await agent.run({ intent: { intent: "car_search", fields: [] } });
    const text = JSON.stringify(result);
    expect(/hallo|hi|danke/i.test(text)).toBe(false);
  });
});
