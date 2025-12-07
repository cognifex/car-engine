import { describe, it, expect } from "vitest";
import { KnowledgeAgent } from "../../src/agents/KnowledgeAgent.js";
import { createMockModel } from "../testUtils/mockModel.js";
import path from "path";

const promptPath = path.resolve(process.cwd(), "src", "prompts", "knowledge.md");
const makeAgent = (handler: any) => new KnowledgeAgent(createMockModel(handler), promptPath);
const countConcepts = (text: string) => text.split(/[.,]/).filter(p => p.trim().length > 0).length;

describe("KnowledgeAgent", () => {
  it("returns only explanation text (schema enforced)", async () => {
    const explanation = "Ein Hybrid kombiniert Verbrenner und E-Motor, spart Sprit und fährt leise in der Stadt.";
    const agent = makeAgent(() => ({ explanation }));
    const result = await agent.run({ message: "Was ist ein Hybrid?" });
    expect(result.explanation).toBe(explanation);
  });

  it("limits to max three Konzepte", async () => {
    const explanation = "Kleinwagen sind günstig, sparsam und wendig.";
    const agent = makeAgent(() => ({ explanation }));
    const result = await agent.run({ message: "Erkläre Kleinwagen" });
    expect(countConcepts(result.explanation)).toBeLessThanOrEqual(3);
  });

  it("keeps language simple for low knowledge", async () => {
    const explanation = "Ein E-Auto fährt mit Batterie, wird an der Steckdose geladen und braucht kein Benzin.";
    const agent = makeAgent(() => ({ explanation }));
    const result = await agent.run({
      message: "Erklär Stromer",
      profiling: { knowledge_level: "low", confidence: "low", tone: "casual" },
    });
    expect(/Batterie|Steckdose|Benzin/i.test(result.explanation)).toBe(true);
    expect(/kWh|Drehmoment|Hubraum/i.test(result.explanation)).toBe(false);
  });
});
