import { describe, it, expect } from "vitest";
import { FrontAgent } from "../../src/agents/FrontAgent.js";
import { createMockModel } from "../testUtils/mockModel.js";
import { frontSchema } from "../../src/utils/types.js";
import path from "path";

const promptPath = path.resolve(process.cwd(), "src", "prompts", "front.md");
const makeAgent = (handler: any) => new FrontAgent(createMockModel(handler), promptPath);

const containsEmoji = (text: string) => /[\p{Emoji}]/u.test(text);
const hasListMarker = (text: string) => /(^|\n)\s*[-*]/.test(text);
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

describe("FrontAgent", () => {
  it("respects 1-2 sentences, <=35 words, no emoji/markdown", async () => {
    const reply = "Hier sind zwei günstige Optionen: Sandero und Fabia. Welches Budget hast du?";
    const agent = makeAgent(() => ({ reply, followUp: "Hast du eine Preisspanne?" }));

    const result = await agent.run({
      message: "Ich suche ein Auto",
      profiling: { knowledge_level: "medium", confidence: "low", tone: "neutral" },
    });

    expect(wordCount(result.reply)).toBeLessThanOrEqual(35);
    expect(containsEmoji(result.reply)).toBe(false);
    expect(hasListMarker(result.reply)).toBe(false);
  });

  it("adapts tone for uncertain user and asks one follow-up", async () => {
    const reply = "Klingt gut, ich halte es einfach. Was ist dein Budget?";
    const agent = makeAgent(() => ({ reply, followUp: "Stadt oder Langstrecke?" }));

    const result = await agent.run({
      message: "Keine Ahnung, brauche Hilfe",
      profiling: { knowledge_level: "low", confidence: "low", tone: "casual" },
    });

    expect(result.followUp?.length).toBeGreaterThan(0);
    expect(result.reply.toLowerCase()).toContain("einfach");
    expect(wordCount(result.reply)).toBeLessThanOrEqual(35);
  });

  it("uses technical precision only when knowledge_level is high", async () => {
    const techReply = "Für Effizienz passt ein Hybrid-SUV; achte auf WLTP-Verbrauch.";
    const simpleReply = "Schau nach sparsamen Kleinwagen wie Fabia oder Clio.";

    const highAgent = makeAgent(() => ({ reply: techReply }));
    const lowAgent = makeAgent(() => ({ reply: simpleReply }));

    const high = await highAgent.run({
      message: "Ich kenne mich aus",
      profiling: { knowledge_level: "high", confidence: "medium", tone: "formal" },
    });
    const low = await lowAgent.run({
      message: "Ich bin unsicher",
      profiling: { knowledge_level: "low", confidence: "low", tone: "neutral" },
    });

    expect(high.reply).toContain("Hybrid");
    expect(low.reply.toLowerCase()).toContain("sparsam");
  });

  it("does not repeat user input and keeps JSON shape", async () => {
    const reply = "Ich finde was Passendes. Welche Nutzung steht im Fokus?";
    const agent = makeAgent((messages: any[]) => {
      const user = messages.find((m: any) => m.role === "user")?.content;
      expect(user).toBeTruthy();
      return { reply, followUp: "Budget?" };
    });

    const result = await agent.run({
      message: "Ich suche ein Auto",
      profiling: { knowledge_level: "medium", confidence: "medium", tone: "neutral" },
    });

    expect(frontSchema.parse(result)).toBeTruthy();
    expect(result.reply.toLowerCase()).not.toContain("ich suche ein auto");
  });

  it("marks lack of offroad offers and passes consistency to the model", async () => {
    const reply = "Ich schärfe die Filter und suche Offroader nach.";
    const agent = makeAgent((messages: any[]) => {
      const payload = JSON.parse(messages.find((m: any) => m.role === "user")?.content || "{}");
      expect(payload.consistency.noRelevantOffers).toBe(true);
      return { reply, followUp: "Darf es auch ein SUV sein?" };
    });

    const result = await agent.run({
      message: "Ich will einen richtigen Geländewagen",
      intent: { intent: "car_search", fields: [{ key: "use_case", value: "geländegängig" }] } as any,
      offers: [{ title: "Lotus Evora", model: "Lotus Evora", price: 0, dealer: "", link: "", image_url: "", location: "", mileage: "", badge: "", isOffroadRelevant: false, isExactMatchToSuggestion: false, relevanceScore: 0, source: "", fallbackReason: "" }],
      matches: { suggestions: [{ model: "Duster", category: "SUV", reason: "" }] } as any,
      profile: { offroadPriority: true, budget: "", usage: "", passengers: "", experience: "", segmentPrefs: [], powertrainPrefs: [], constraints: [], knowledge_level: "medium", confidence: "medium", terrain: "", drivetrain: "", bodyTypePreference: "", robustness: "", use_case: "" },
    });

    expect(result.reply).toContain("Filter");
  });
});
