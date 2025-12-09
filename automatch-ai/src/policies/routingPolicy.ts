import { ContentState, RouteDecision } from "../utils/types.js";

export type RoutingPolicyConfig = {
  allowStrictMatching: boolean;
  clarificationThreshold: number;
};

const defaultConfig: RoutingPolicyConfig = {
  allowStrictMatching: true,
  clarificationThreshold: 1,
};

export type RoutingInputs = {
  intent?: { intent?: string; brand?: string; frustration?: boolean };
  structuredSignals?: Record<string, unknown>;
  offerCount?: number;
  relevanceScore?: number;
  needsClarification?: boolean;
};

export type RoutingDecision = {
  route: RouteDecision;
  content_state: ContentState;
};

export const evaluateRouting = (
  inputs: RoutingInputs,
  config: RoutingPolicyConfig = defaultConfig,
): RoutingDecision => {
  const offerCount = inputs.offerCount || 0;
  const no_relevant_results = offerCount === 0;
  const clarification_required = Boolean(inputs.needsClarification);
  const fallback_used = Boolean(inputs.relevanceScore && inputs.relevanceScore < config.clarificationThreshold);

  const strict_matching = config.allowStrictMatching && !clarification_required && !fallback_used;

  const route: RouteDecision = {
    includeKnowledge: !clarification_required,
    includeVisuals: !fallback_used,
    includeMatching: !clarification_required,
    includeOffers: true,
    strictOffers: strict_matching,
    retryMatching: fallback_used,
  };

  const content_state: ContentState = {
    has_results: offerCount > 0,
    num_results: offerCount,
    clarification_required,
    no_relevant_results,
    fallback_used,
    strict_matching,
    notes: [],
  };

  if (clarification_required && strict_matching) {
    content_state.notes?.push("Clarification requested, strict matching disabled.");
  }

  return { route, content_state };
};
