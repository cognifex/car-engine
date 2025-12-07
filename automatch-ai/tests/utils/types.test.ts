import { describe, it, expect } from "vitest";
import { profilingSchema, intentSchema, matchSchema, visualSchema, frontSchema } from "../../src/utils/types.js";

const sampleProfiling = { knowledge_level: "medium", confidence: "low", tone: "casual" };
const sampleIntent = { intent: "car_search", fields: [{ key: "budget", value: "15000" }] };

describe("types schemas", () => {
  it("validates profiling schema", () => {
    expect(() => profilingSchema.parse(sampleProfiling)).not.toThrow();
  });

  it("rejects invalid tone", () => {
    expect(() => profilingSchema.parse({ ...sampleProfiling, tone: "loud" as any })).toThrow();
  });

  it("validates intent schema with fields array", () => {
    expect(() => intentSchema.parse(sampleIntent)).not.toThrow();
  });

  it("validates matching suggestions shape", () => {
    const data = { suggestions: [{ model: "Fabia", category: "Kleinwagen", reason: "Günstig" }] };
    expect(() => matchSchema.parse(data)).not.toThrow();
  });

  it("validates visual schema with non-empty list", () => {
    expect(() => visualSchema.parse({ image_urls: ["https://example.com/a.png"] })).not.toThrow();
  });

  it("validates front schema reply/followUp", () => {
    expect(() => frontSchema.parse({ reply: "Hallo", followUp: "Budget?" })).not.toThrow();
  });
});
