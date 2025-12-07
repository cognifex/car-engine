import { describe, it, expect } from "vitest";
import { VisualAgent } from "../../src/agents/VisualAgent.js";
import { createMockModel } from "../testUtils/mockModel.js";
import { visualSchema } from "../../src/utils/types.js";
import path from "path";

const promptPath = path.resolve(process.cwd(), "src", "prompts", "visual.md");
const makeAgent = (handler: any) => new VisualAgent(createMockModel(handler), promptPath);

const hasText = (urls: string[]) => urls.some((u) => /\s/.test(u));

describe("VisualAgent", () => {
  it("returns valid JSON with non-empty image list", async () => {
    const urls = ["https://example.com/car1.png", "https://example.com/car2.png"];
    const agent = makeAgent(() => ({ image_urls: urls }));
    const result = await agent.run({ intent: { intent: "car_search", fields: [] } });
    expect(() => visualSchema.parse(result)).not.toThrow();
    expect(result.image_urls.length).toBeGreaterThan(0);
  });

  it("limits to max 10 images and contains no text", async () => {
    const urls = Array.from({ length: 12 }, (_, i) => `https://example.com/img-${i}.png`).slice(0, 10);
    const agent = makeAgent(() => ({ image_urls: urls }));
    const result = await agent.run({ intent: { intent: "car_search", fields: [] } });
    expect(result.image_urls.length).toBeLessThanOrEqual(10);
    expect(hasText(result.image_urls)).toBe(false);
  });
});
