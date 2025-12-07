import { AgentBase } from "./AgentBase.js";
import { OfferListSchema, Offer, ConversationMessage } from "../utils/types.js";
import { fetchApifyMobileListings } from "../utils/apify.js";

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
  const parseBudget = () => {
    const raw = input.fields?.find(f => f.key === "budget")?.value;
    if (!raw) return undefined;
    const num = Number(String(raw).replace(/[^0-9]/g, ""));
    return Number.isFinite(num) && num > 0 ? num : undefined;
  };

  const combinedText = `${input.userMessage || ""} ${(input.history || []).map(h => h.content).join(" ")}`;

  const isGermanContext = () => {
    const text = combinedText.toLowerCase();
    return text.includes("deutsch") || text.includes("german") || text.includes("deutschland") || text.includes("germany");
  };

  const inferGermanZip = () => {
    const text = `${combinedText} ${JSON.stringify(input.fields || {})}`.toLowerCase();
    if (text.includes("deutsch") || text.includes("germany") || text.includes("de")) {
      return "10115"; // Berlin Mitte als generischer Bezug
    }
    return undefined;
  };

  const defaultBrandModelForBudget = (budget?: number) => {
    if (budget && budget > 0) {
      if (budget <= 12000) return { brand: "Volkswagen", model: "Polo" };
      if (budget <= 20000) return { brand: "Skoda", model: "Octavia" };
    }
    return { brand: "Volkswagen", model: "Golf" };
  };

  const zipGuess = input.zip || inferGermanZip();
  const fieldBrand = input.fields?.find(f => f.key === "brand")?.value;
  const fieldModel = input.fields?.find(f => f.key === "model")?.value || input.matchModel;

  // Split matchModel like "Volkswagen Polo" into brand/model guess
  const splitGuess = () => {
    if (!fieldModel) return { b: undefined, m: undefined };
    const parts = fieldModel.split(/\s+/);
    if (parts.length < 2) return { b: undefined, m: fieldModel };
    return { b: parts[0], m: parts.slice(1).join(" ") };
  };
  const guess = splitGuess();

  const budgetNum = input.maxPrice || parseBudget();
  const german = isGermanContext();
  const defaultBM = german ? defaultBrandModelForBudget(budgetNum) : { brand: undefined, model: undefined };

    const params = {
      brand: input.brand || fieldBrand || guess.b || defaultBM.brand,
      model: input.model || fieldModel || guess.m || defaultBM.model,
      maxItems: input.maxItems ?? 5,
      zip: zipGuess,
      distance: input.distance ?? (zipGuess ? 200 : undefined),
      maxPrice: budgetNum,
      countryHint: german ? "DE" : undefined,
    };

    const apifyOffers = await fetchApifyMobileListings({
      brand: params.brand,
      model: params.model,
      maxItems: params.maxItems,
      maxPrice: params.maxPrice,
    });

    const filtered = apifyOffers.filter(o =>
      o.image_url && o.image_url.startsWith("http") && o.link && o.price > 0 && o.title
    );

    return { offers: filtered };
  }
}
