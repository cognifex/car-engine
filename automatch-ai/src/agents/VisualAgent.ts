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
    try {
      const generated = await this.callLLM<VisualOutput>(input);
      if (generated.image_urls?.length) return generated;
    } catch {
      // fall through to placeholder
    }
    // Minimal placeholder to satisfy UI while avoiding empty arrays
    return { image_urls: ["https://via.placeholder.com/640x360?text=Auto"] };
  }
}
