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
  repeatWithChangedConstraints?: boolean;
  allowOffers?: boolean;
};

export type RoutingDecision = {
  route: RouteDecision;
  content_state: ContentState;
};

export const evaluateRouting = (
  inputs: RoutingInputs,
  config: RoutingPolicyConfig = defaultConfig,
): RoutingDecision => {
  const allowOffers = inputs.allowOffers !== undefined ? inputs.allowOffers : true;
  const offerCount = allowOffers ? inputs.offerCount || 0 : 0;
  const no_relevant_results = !allowOffers || offerCount === 0;
  const clarification_required = Boolean(inputs.needsClarification) || !allowOffers;
  const fallback_used =
    Boolean(inputs.relevanceScore && inputs.relevanceScore < config.clarificationThreshold) ||
    Boolean(inputs.repeatWithChangedConstraints) ||
    !allowOffers;

  const strict_matching = config.allowStrictMatching && !clarification_required && !fallback_used && allowOffers;

  const route: RouteDecision = {
    includeKnowledge: clarification_required || !allowOffers ? true : !clarification_required,
    includeVisuals: !fallback_used,
    includeMatching: allowOffers && !clarification_required,
    includeOffers: allowOffers && !clarification_required,
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
