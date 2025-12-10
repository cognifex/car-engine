import { AgentBase } from "./AgentBase.js";
import {
  OfferListSchema,
  Offer,
  ConversationMessage,
  MatchingOutput,
  RouteDecision,
  PerfectProfile,
} from "../utils/types.js";
import { loadSpecs, SpecModel } from "../utils/specs.js";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=640&q=70&sat=-10";
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
  matches?: MatchingOutput;
  route?: RouteDecision;
  profile?: PerfectProfile;
  offerSearchState?: {
    failureCount?: number;
    lastStrategy?: string;
  };
}

export class OfferAgent extends AgentBase<OfferAgentInput, typeof OfferListSchema> {
  constructor() {
    // No prompt needed for non-LLM agent, pass dummy values
    super({ name: "OfferAgent", model: {} as any, promptPath: "", schema: OfferListSchema });
  }

  async run(input: OfferAgentInput): Promise<{ offers: Offer[]; meta: Record<string, unknown>; nextSearchState: OfferAgentInput["offerSearchState"] }> {
    const combinedText = `${input.userMessage || ""} ${(input.history || []).map(h => h.content).join(" ")}`.toLowerCase();
    const fieldBrand = input.fields?.find(f => f.key === "brand")?.value?.toLowerCase();
    const offroadPhrases = ["gelände", "offroad", "4x4", "allrad", "awd", "suv", "karoq", "duster", "kuga"];

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

    const isOffroadRequest = () => {
      const useCaseField = input.fields?.find(f => f.key === "use_case")?.value?.toLowerCase() || "";
      const profileUseCase = (input.profile?.usage || "").toLowerCase() + " " + (input.profile?.use_case || "");
      const matchCategories = (input.matches?.suggestions || []).map((s) => (s.category || "").toLowerCase()).join(" ");
      return (
        offroadPhrases.some((p) => combinedText.includes(p)) ||
        offroadPhrases.some((p) => useCaseField.includes(p)) ||
        offroadPhrases.some((p) => profileUseCase.includes(p)) ||
        offroadPhrases.some((p) => matchCategories.includes(p)) ||
        Boolean(input.route?.strictOffers) ||
        Boolean(input.profile?.offroadPriority)
      );
    };

    const offroadRequired = isOffroadRequest();

    const isOffroadSpec = (spec: SpecModel) => {
      const body = (spec.bodyType || "").toLowerCase();
      const drive = (spec.drivetrain || "").toLowerCase();
      const model = (spec.model || "").toLowerCase();
      return (
        body.includes("suv") ||
        body.includes("tt") ||
        body.includes("offroad") ||
        body.includes("crossover") ||
        drive.includes("4wd") ||
        drive.includes("awd") ||
        drive.includes("allrad") ||
        model.includes("4x4") ||
        model.includes("awd")
      );
    };

    const wantedBody = (() => {
      if (combinedText.match(/suv|geländewagen|crossover/)) return "SUV";
      if (input.profile?.bodyTypePreference) return input.profile.bodyTypePreference;
      return undefined;
    })();

    const wantedFuel = (() => {
      if (combinedText.match(/e-?auto|elektro|electric|ev\b|id\./)) return "electric";
      if (combinedText.match(/hybrid|phev/)) return "hybrid";
      if (combinedText.match(/diesel/)) return "diesel";
      if (combinedText.match(/benzin|gasoline|petrol/)) return "petrol";
      return undefined;
    })();

    const retroFromText = () => combinedText.match(/retro|oldtimer|klassik|vintage|youngtimer/);
    const fastFlag = () => combinedText.match(/schnell|flitzer|sport|racing|rasant|leistung|ps\b|kw\b/);

    const suggestedModels = (input.matches?.suggestions || []).map((s) => s.model);
    const queryModels = suggestedModels.length ? suggestedModels : [input.matchModel].filter(Boolean);
    const maxAgeYears = combinedText.match(/modern|neu|neuest/) ? 8 : undefined;

    const primaryCandidates = (() => {
      if (!queryModels.length) return [];
      return specs.filter((spec) => {
        const fullModel = `${spec.brand} ${spec.model}`.toLowerCase();
        const matchHit = queryModels.some((m) => fullModel.includes((m || "").toLowerCase()));
        if (!matchHit) return false;
        if (offroadRequired && !isOffroadSpec(spec)) return false;
        if (wantedBody && !(spec.bodyType || "").toLowerCase().includes(wantedBody.toLowerCase())) return false;
        if (wantedFuel && !(spec.fuel || "").toLowerCase().includes(wantedFuel)) return false;
        return true;
      });
    })();

    const fallbackOffroad = specs.filter((spec) => {
      if (offroadRequired && !isOffroadSpec(spec)) return false;
      if (wantedBody && !(spec.bodyType || "").toLowerCase().includes(wantedBody.toLowerCase())) return false;
      if (brandGuess && !(spec.brand || "").toLowerCase().includes(brandGuess)) return false;
      return true;
    });

    const fallbackSameSegment = specs.filter((spec) => {
      const body = (spec.bodyType || "").toLowerCase();
      return body.includes("suv") || body.includes("crossover") || body.includes("tt");
    });

    const dedupeByModel = (items: SpecModel[]) => {
      const seen = new Set<string>();
      return items.filter((spec) => {
        const key = `${(spec.brand || "").toLowerCase()}|${(spec.model || "").toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const diversifyByBrand = (items: SpecModel[]) => {
      const brandSeen = new Set<string>();
      const diversified: SpecModel[] = [];
      for (const spec of items) {
        const brand = (spec.brand || "").toLowerCase();
        if (!brandSeen.has(brand) || diversified.length < (input.maxItems ?? 6)) {
          diversified.push(spec);
          brandSeen.add(brand);
        }
        if (diversified.length >= (input.maxItems ?? 6)) break;
      }
      return diversified;
    };

    const priorFailures = input.offerSearchState?.failureCount ?? 0;

    const pickStrategy = () => {
      if (primaryCandidates.length) return "matches_primary";
      if (offroadRequired && fallbackOffroad.length) return "offroad_segment_fallback";
      if (offroadRequired && priorFailures > 0 && fallbackSameSegment.length) return "segment_suv_retry";
      if (offroadRequired && fallbackSameSegment.length) return "segment_suv_fallback";
      return "broad_shuffle";
    };

    const strategy = pickStrategy();
    const baseList =
      strategy === "matches_primary"
        ? primaryCandidates
        : strategy === "offroad_segment_fallback"
          ? fallbackOffroad
          : strategy === "segment_suv_fallback"
            ? fallbackSameSegment
            : strategy === "segment_suv_retry"
              ? fallbackSameSegment
              : getOffers({
                  brand: brandGuess,
                  sortByPower: Boolean(fastFlag()),
                  limit: 20,
                  dedupe: true,
                  shuffle: true,
                });

    const ranked = dedupeByModel(baseList).map((spec) => {
      const fullModel = `${spec.brand} ${spec.model}`.trim();
      const exact = queryModels.some((m) => fullModel.toLowerCase().includes((m || "").toLowerCase()));
      const offroad = isOffroadSpec(spec);
      const score =
        (exact ? 60 : 0) +
        (offroad ? 25 : 0) +
        (brandGuess && (spec.brand || "").toLowerCase().includes(brandGuess) ? 10 : 0) +
        (wantedBody && (spec.bodyType || "").toLowerCase().includes(wantedBody.toLowerCase()) ? 5 : 0);
      return { spec, exact, offroad, score };
    });

    const sorted = ranked.sort((a, b) => b.score - a.score);
    const diversified = diversifyByBrand(sorted.map((r) => r.spec));
    const limited = diversified.slice(0, input.maxItems ?? 6);

    const buildBadge = (spec: SpecModel) =>
      [
        spec.bodyType,
        spec.enginePowerKw ? `${spec.enginePowerKw} kW` : "",
        spec.fuel,
        spec.transmission,
        spec.drivetrain,
      ]
        .filter(Boolean)
        .join(" • ");

    const toOffer = (spec: SpecModel): Offer => {
      const fullModel = `${spec.brand} ${spec.model}`.trim();
      const relevance = sorted.find((r) => `${r.spec.brand} ${r.spec.model}`.trim() === fullModel);
      const image = spec.image || FALLBACK_IMAGE;
      return {
        title: `${spec.brand} ${spec.model}${spec.year ? " (" + spec.year + ")" : ""}`,
        model: fullModel,
        price: 0,
        dealer: "Modell-Info",
        link: spec.url || "",
        image_url: image,
        location: "",
        mileage: "",
        badge: buildBadge(spec),
        created_at: new Date().toISOString(),
        vin: "",
        isOffroadRelevant: Boolean(relevance?.offroad),
        isExactMatchToSuggestion: Boolean(relevance?.exact),
        relevanceScore: relevance?.score ?? 0,
        source: strategy,
        fallbackReason: strategy === "broad_shuffle" ? "no_relevant_offroad" : "",
        why: "",
        fit_reasons: [],
        caution: "",
        tip: "",
        tags: buildBadge(spec).split(" • ").filter(Boolean),
        is_hidden_gem: ["dacia", "skoda", "kia", "hyundai", "mazda", "seat"].includes((spec.brand || "").toLowerCase()),
      };
    };

    const offers = limited.map(toOffer);
    const noRelevantOffers = offroadRequired && offers.every((o) => !o.isOffroadRelevant);
    const nextSearchState = {
      failureCount: noRelevantOffers ? (input.offerSearchState?.failureCount || 0) + 1 : 0,
      lastStrategy: strategy,
    };

    const meta = {
      queryModels,
      offroadRequired,
      fallbackUsed: strategy !== "matches_primary",
      noRelevantOffers,
      strategy,
      previousFailureCount: priorFailures,
      failureCount: nextSearchState.failureCount,
      relevance: offers.map((o) => ({
        model: o.model,
        isOffroadRelevant: o.isOffroadRelevant,
        isExactMatchToSuggestion: o.isExactMatchToSuggestion,
        relevanceScore: o.relevanceScore,
      })),
    };

    return { offers, meta, nextSearchState };
  }
}
