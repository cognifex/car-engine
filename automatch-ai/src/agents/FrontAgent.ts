import { ChatOpenAI } from "@langchain/openai";
import { AgentBase } from "./AgentBase.js";
import {
  frontSchema,
  FrontOutput,
  IntentOutput,
  KnowledgeOutput,
  MatchingOutput,
  ProfilingOutput,
  VisualOutput,
  Offer,
  PerfectProfile,
  ConversationMessage,
} from "../utils/types.js";
import { fetchBackground } from "../utils/background.js";
import { logger } from "../utils/logger.js";

export interface FrontInput {
  message: string;
  profiling?: ProfilingOutput;
  intent?: IntentOutput;
  knowledge?: KnowledgeOutput;
  visuals?: VisualOutput;
  matches?: MatchingOutput;
  offers?: Offer[];
  profile?: PerfectProfile;
  history?: ConversationMessage[];
  background?: string;
}

export class FrontAgent extends AgentBase<FrontInput, typeof frontSchema> {
  constructor(model: ChatOpenAI, promptPath: string) {
    super({ name: "FrontAgent", model, promptPath, schema: frontSchema });
  }

  async run(input: FrontInput): Promise<FrontOutput> {
    const offers = input.offers || [];
    const message = input.message || "";

    let enrichedInput = { ...input };

    // Try to fetch concise background info for a model the user mentioned that is part of current offers.
    const targetOffer = findMentionedOffer(message, offers);
    if (targetOffer) {
      const historyText = (input.history || [])
        .map((m) => `${m.role}: ${m.content}`)
        .join(" | ");
      try {
        const background = await fetchBackground(
          targetOffer.model || targetOffer.title,
          offers,
          message,
          historyText
        );
        if (background) {
          enrichedInput = { ...input, background };
        }
      } catch (err) {
        logger.warn({ err }, "FrontAgent background fetch failed");
      }
    }

    return this.callLLM<FrontOutput>(enrichedInput);
  }
}

function findMentionedOffer(message: string, offers: Offer[]): Offer | undefined {
  const msg = message.toLowerCase();
  if (!msg.trim()) return undefined;

  return offers.find((offer) => {
    const model = (offer.model || "").toLowerCase();
    const title = (offer.title || "").toLowerCase();
    const brand = (offer.badge || "").toLowerCase();
    return (
      (model && msg.includes(model)) ||
      (title && msg.includes(title)) ||
      (brand && msg.includes(brand))
    );
  });
}
