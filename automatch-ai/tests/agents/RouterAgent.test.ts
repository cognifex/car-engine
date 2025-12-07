import { describe, it, expect } from "vitest";
import { RouterAgent } from "../../src/agents/RouterAgent.js";
import { createMockModel } from "../testUtils/mockModel.js";
import { routeSchema } from "../../src/utils/types.js";
import path from "path";

const promptPath = path.resolve(process.cwd(), "src", "prompts", "router.md");
const makeAgent = (handler: any) => new RouterAgent(createMockModel(handler), promptPath);

describe("RouterAgent", () => {
  it("disables modules for off-topic", async () => {
    const agent = makeAgent(() => ({ includeKnowledge: false, includeVisuals: false, includeMatching: false, includeOffers: false }));
    const result = await agent.run({ message: "Wie ist das Wetter?" });
    expect(routeSchema.parse(result)).toBeTruthy();
    expect(result.includeKnowledge).toBe(false);
    expect(result.includeMatching).toBe(false);
  });

  it("enables matching for car_search", async () => {
    const agent = makeAgent(() => ({ includeKnowledge: true, includeVisuals: true, includeMatching: true, includeOffers: true }));
    const result = await agent.run({
      message: "Ich suche ein Auto",
      intent: { intent: "car_search", fields: [] },
    });
    expect(result.includeMatching).toBe(true);
  });
});
