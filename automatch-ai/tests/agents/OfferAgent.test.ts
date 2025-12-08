import { describe, it, expect, vi, afterEach } from "vitest";
import { OfferAgent } from "../../src/agents/OfferAgent.js";
import * as specs from "../../src/utils/specs.js";

const offroadSample = [
  {
    brand: "Toyota",
    model: "RAV4 III 22 D 4D Advance 4x4",
    bodyType: "SUV / TT",
    fuel: "Diesel",
    transmission: "Manuell",
    drivetrain: "4WD",
    image: "https://example.com/rav4.png",
    url: "https://example.com/rav4",
  },
  {
    brand: "Skoda",
    model: "Octavia 1.6 TDI",
    bodyType: "Hatchback",
    fuel: "Diesel",
    transmission: "Manuell",
    drivetrain: "FWD",
    image: "https://example.com/octavia.png",
    url: "https://example.com/octavia",
  },
];

describe("OfferAgent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prioritizes offroad suggestions when use_case demands it", async () => {
    vi.spyOn(specs, "loadSpecs").mockReturnValue(offroadSample as any);
    const agent = new OfferAgent();
    const result = await agent.run({
      matches: { suggestions: [{ model: "RAV4", category: "SUV", reason: "Offroad-tauglich" }] } as any,
      fields: [{ key: "use_case", value: "geländegängig" }],
      route: { includeKnowledge: true, includeVisuals: false, includeMatching: true, includeOffers: true, strictOffers: true, retryMatching: false },
    });

    expect(result.offers[0].model.toLowerCase()).toContain("rav4");
    expect(result.offers[0].isOffroadRelevant).toBe(true);
    expect((result.meta as any).offroadRequired).toBe(true);
  });

  it("flags noRelevantOffers when only non-offroad cars exist", async () => {
    vi.spyOn(specs, "loadSpecs").mockReturnValue([offroadSample[1]] as any); // only hatchback
    const agent = new OfferAgent();
    const result = await agent.run({
      matches: { suggestions: [{ model: "Imaginary 4x4", category: "SUV", reason: "Offroad" }] } as any,
      fields: [{ key: "use_case", value: "richtiger Geländewagen" }],
      route: { includeKnowledge: true, includeVisuals: false, includeMatching: true, includeOffers: true, strictOffers: true, retryMatching: false },
    });

    expect(result.offers.every((o) => o.isOffroadRelevant === false)).toBe(true);
    expect((result.meta as any).noRelevantOffers).toBe(true);
  });
});
