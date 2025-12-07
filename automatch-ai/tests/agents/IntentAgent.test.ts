import { describe, it, expect } from "vitest";
import { IntentAgent } from "../../src/agents/IntentAgent.js";
import { createMockModel } from "../testUtils/mockModel.js";
import { intentSchema } from "../../src/utils/types.js";
import path from "path";

const promptPath = path.resolve(process.cwd(), "src", "prompts", "intent.md");
const makeAgent = (handler: any) => new IntentAgent(createMockModel(handler), promptPath);

describe("IntentAgent", () => {
  it("classifies car_search intent", async () => {
    const agent = makeAgent(() => ({ intent: "car_search", fields: [{ key: "budget", value: "20000" }] }));
    const result = await agent.run({ message: "Suche Kombi bis 20k" });
    expect(intentSchema.parse(result).intent).toBe("car_search");
    expect(result.fields[0]).toEqual({ key: "budget", value: "20000" });
  });

  it("returns unknown for off-topic", async () => {
    const agent = makeAgent(() => ({ intent: "unknown", fields: [] }));
    const result = await agent.run({ message: "Wie wird das Wetter?" });
    expect(result.intent).toBe("unknown");
    expect(result.fields.length).toBe(0);
  });

  it("extracts multiple fields deterministically", async () => {
    const agent = makeAgent(() => ({
      intent: "budget_info",
      fields: [
        { key: "budget", value: "15000" },
        { key: "segment", value: "kleinwagen" },
      ],
    }));
    const result = await agent.run({ message: "Brauche Kleinwagen bis 15k" });
    expect(result.fields).toHaveLength(2);
    expect(result.fields.map(f => f.key)).toContain("budget");
  });
});
