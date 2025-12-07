import { ContentPayload, Offer } from "../utils/types.js";

export interface AggregateInput {
  offers?: Offer[];
  visuals?: string[];
  knowledgeText?: string;
}

export const aggregateContent = (input: AggregateInput): ContentPayload => {
  const offers = (input.offers || []).slice(0, 5);
  const visuals = (input.visuals || []).slice(0, 8);
  const definition = input.knowledgeText || "";
  return { offers, visuals, definition };
};
