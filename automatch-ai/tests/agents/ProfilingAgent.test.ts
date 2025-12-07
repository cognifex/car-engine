import { describe, it, expect } from "vitest";
import { ProfilingAgent } from "../../src/agents/ProfilingAgent.js";
import { createMockModel } from "../testUtils/mockModel.js";
import { profilingSchema } from "../../src/utils/types.js";
import path from "path";

const promptPath = path.resolve(process.cwd(), "src", "prompts", "profiling.md");
const makeAgent = (handler: any) => new ProfilingAgent(createMockModel(handler), promptPath);

describe("ProfilingAgent", () => {
  it("returns valid schema", async () => {
    const agent = makeAgent(() => ({ knowledge_level: "medium", confidence: "low", tone: "casual" }));
    const result = await agent.run({ message: "keine Ahnung, hilf mir" });
    expect(() => profilingSchema.parse(result)).not.toThrow();
  });

  it("detects low confidence from uncertainty markers", async () => {
    const agent = makeAgent((messages: any[]) => {
      const text = messages.find((m: any) => m.role === "user")?.content || "";
      if (/keine ahnung|weiß nicht/i.test(text)) {
        return { knowledge_level: "low", confidence: "low", tone: "neutral" };
      }
      return { knowledge_level: "medium", confidence: "medium", tone: "neutral" };
    });
    const result = await agent.run({ message: "keine Ahnung was ich brauche" });
    expect(result.confidence).toBe("low");
    expect(result.knowledge_level).toBe("low");
  });

  it("detects high knowledge from tech terms", async () => {
    const agent = makeAgent((messages: any[]) => {
      const text = messages.find((m: any) => m.role === "user")?.content || "";
      if (/ps|drehmoment|hubraum/i.test(text)) {
        return { knowledge_level: "high", confidence: "medium", tone: "formal" };
      }
      return { knowledge_level: "medium", confidence: "medium", tone: "neutral" };
    });
    const result = await agent.run({ message: "Ich will mindestens 150 PS und guten Drehmoment" });
    expect(result.knowledge_level).toBe("high");
    expect(result.tone).toBe("formal");
  });
});
