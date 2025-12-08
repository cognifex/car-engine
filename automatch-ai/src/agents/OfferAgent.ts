import { AgentBase } from "./AgentBase.js";
import { OfferListSchema, Offer, ConversationMessage } from "../utils/types.js";
import { loadSpecs, SpecModel } from "../utils/specs.js";
import { getOffers } from "../utils/dataApi.js";

export interface OfferAgentInput {
  brand?: string;
  model?: string;
  maxItems?: number;
  intent?: string;
  fields?: { key: string; value: string }[];
  profiling?: any;
  matchModel?: string;
  zip?: string;
  distance?: number;
  maxPrice?: number;
  userMessage?: string;
  history?: ConversationMessage[];
}

export class OfferAgent extends AgentBase<OfferAgentInput, typeof OfferListSchema> {
  constructor() {
    // No prompt needed for non-LLM agent, pass dummy values
    super({ name: "OfferAgent", model: {} as any, promptPath: "", schema: OfferListSchema });
  }

  async run(input: OfferAgentInput): Promise<{ offers: Offer[] }> {
    const combinedText = `${input.userMessage || ""} ${(input.history || []).map(h => h.content).join(" ")}`.toLowerCase();
    const fieldBrand = input.fields?.find(f => f.key === "brand")?.value?.toLowerCase();
    const passengersRaw = input.fields?.find(f => f.key === "passengers")?.value;
    const passengers = passengersRaw ? Number(String(passengersRaw).replace(/[^0-9]/g, "")) : undefined;

    const specs = loadSpecs();
    const detectBrandFromText = () => {
      const words = new Set((combinedText.match(/[a-zäöüß0-9\-]+/gi) || []).map((w) => w.toLowerCase()));
      const brands = new Set(specs.map((s) => (s.brand || "").toLowerCase()).filter(Boolean));
      for (const w of words) {
        if (brands.has(w)) return w;
      }
      return undefined;
    };

    const brandGuess = fieldBrand || detectBrandFromText();

    const isVague = () => {
      return (
        !brandGuess &&
        !input.model &&
        !combinedText.match(/\d{4}/) &&
        (combinedText.includes("retro") ||
          combinedText.includes("cool") ||
          combinedText.includes("egal") ||
          combinedText.includes("vage") ||
          combinedText.includes("irgend") ||
          combinedText.length < 15)
      );
    };

    const bodyTypeFromText = () => {
      if (combinedText.match(/suv|geländewagen|crossover/)) return "SUV";
      if (combinedText.match(/kombi|wagon/)) return "Wagon";
      if (combinedText.match(/van|kasten/)) return "Van";
      if (combinedText.match(/klein|stadt|compact|kompakt/)) return "Hatchback";
      if (combinedText.match(/limousine|sedan/)) return "Sedan";
      return undefined;
    };
    const fuelFromText = () => {
      if (combinedText.match(/e-?auto|elektro|electric|ev\b|id\./)) return "electric";
      if (combinedText.match(/hybrid|phev/)) return "hybrid";
      if (combinedText.match(/diesel/)) return "diesel";
      if (combinedText.match(/benzin|gasoline|petrol/)) return "petrol";
      return undefined;
    };
    const retroFromText = () => {
      return combinedText.match(/retro|oldtimer|klassik|vintage|youngtimer/);
    };
    const fastFlag = () => combinedText.match(/schnell|flitzer|sport|racing|rasant|leistung|ps\b|kw\b/);
    const ageFromText = () => {
      const m = combinedText.match(/max\s*([\d]{1,2})\s*(jahre|years?)/);
      if (m) return Number(m[1]);
      if (combinedText.match(/modern|neu|neuest/)) return 8;
      return undefined;
    };
    const wantedBody = bodyTypeFromText();
    const maxAgeYears = ageFromText();
    const wantedFuel = fuelFromText();

    const offers = isVague()
      ? getOffers({
          limit: input.maxItems ?? 6,
          dedupe: true,
          shuffle: true,
        })
      : getOffers({
          bodyType: wantedBody,
          brand: brandGuess,
          maxAgeYears,
          fuelIncludes: wantedFuel,
          retro: Boolean(retroFromText()),
          sortByPower: Boolean(fastFlag()),
          limit: input.maxItems ?? 6,
          dedupe: true,
          shuffle: true,
        });

    // If the query is very vague or we found nothing, fall back to a broad shuffle.
    const finalOffers =
      offers.length > 0
        ? offers
        : getOffers({
            brand: brandGuess,
            sortByPower: Boolean(fastFlag()),
            limit: input.maxItems ?? 6,
            dedupe: true,
            shuffle: true,
          });

    const toOffer = (spec: SpecModel): Offer => ({
      title: `${spec.brand} ${spec.model}${spec.year ? " (" + spec.year + ")" : ""}`,
      model: `${spec.brand} ${spec.model}`,
      price: 0,
      dealer: "Modell-Info",
      link: spec.url || "",
      image_url: spec.image || "",
      location: "",
      mileage: "",
      badge: [
        spec.bodyType,
        spec.enginePowerKw ? `${spec.enginePowerKw} kW` : "",
        spec.fuel,
        spec.transmission,
      ].filter(Boolean).join(" • "),
      created_at: new Date().toISOString(),
      vin: "",
    });

    return { offers: finalOffers.map(toOffer) };
  }
}
