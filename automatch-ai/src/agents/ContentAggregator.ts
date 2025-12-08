import { ContentPayload, Offer, MatchingOutput, PerfectProfile } from "../utils/types.js";

export interface AggregateInput {
  offers?: Offer[];
  visuals?: string[];
  knowledgeText?: string;
  matches?: MatchingOutput;
  profile?: PerfectProfile;
  offersMeta?: Record<string, unknown>;
}

export const aggregateContent = (input: AggregateInput): ContentPayload => {
  const offersWithRelevance = applyRelevanceSort(input.offers || [], input.matches);
  const offers = offersWithRelevance.slice(0, 5);
  const visuals = (input.visuals || []).slice(0, 8);
  const definition = input.knowledgeText || "";
  return {
    offers,
    visuals,
    definition,
    matches: input.matches,
    profile: input.profile,
    offerDiagnostics: buildDiagnostics(input, offersWithRelevance),
  };
};

const applyRelevanceSort = (offers: Offer[], matches?: MatchingOutput): Offer[] => {
  if (!offers.length) return [];
  const suggestionModels = new Set((matches?.suggestions || []).map((s) => (s.model || "").toLowerCase()));
  return [...offers]
    .map((offer) => {
      const lowerModel = (offer.model || "").toLowerCase();
      const isExact = suggestionModels.has(lowerModel);
      const segmentHit = lowerModel.includes("suv") || lowerModel.includes("4x4") || lowerModel.includes("awd");
      const score =
        (offer.relevanceScore || 0) +
        (offer.isOffroadRelevant ? 25 : 0) +
        (isExact ? 40 : 0) +
        (segmentHit ? 10 : 0);
      return { offer, score, isExact };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ offer }) => offer);
};

const buildDiagnostics = (input: AggregateInput, offers: Offer[]) => {
  const matches = input.matches;
  const offroadRelevantCount = offers.filter((o) => o.isOffroadRelevant).length;
  const hasExact = offers.some((o) => o.isExactMatchToSuggestion);
  const offroadRequired =
    Boolean(input.profile?.offroadPriority) ||
    (input.profile?.use_case || "").toLowerCase().includes("gelände") ||
    (input.profile?.usage || "").toLowerCase().includes("gelände");

  return {
    ...(input.offersMeta || {}),
    queryModels: (matches?.suggestions || []).map((s) => s.model),
    offroadRequired,
    fallbackUsed: Boolean((input.offersMeta as any)?.fallbackUsed),
    noRelevantOffers: offroadRequired && offroadRelevantCount === 0,
    strategy: (input.offersMeta as any)?.strategy || "",
    failureCount: (input.offersMeta as any)?.failureCount || 0,
    relevance: offers.map((o) => ({
      model: o.model,
      isOffroadRelevant: o.isOffroadRelevant,
      isExactMatchToSuggestion: o.isExactMatchToSuggestion,
      relevanceScore: o.relevanceScore,
    })),
    hasExact,
  };
};
