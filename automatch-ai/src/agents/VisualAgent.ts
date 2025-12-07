import { ChatOpenAI } from "@langchain/openai";
import { AgentBase } from "./AgentBase.js";
import { visualSchema, VisualOutput, IntentOutput, KnowledgeOutput, ConversationMessage } from "../utils/types.js";
import { fetchVehiclePhotos } from "../utils/apify.js";

export interface VisualInput {
  intent?: IntentOutput;
  knowledge?: KnowledgeOutput;
  history?: ConversationMessage[];
}

export class VisualAgent extends AgentBase<VisualInput, typeof visualSchema> {
  constructor(model: ChatOpenAI, promptPath: string) {
    super({ name: "VisualAgent", model, promptPath, schema: visualSchema });
  }

  async run(input: VisualInput): Promise<VisualOutput> {
    // Disable external photo fetch; rely on offer images only
    return { image_urls: [] };
  }
}
