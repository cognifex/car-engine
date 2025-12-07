import { ChatOpenAI } from "@langchain/openai";
import { AgentBase } from "./AgentBase.js";
import { knowledgeSchema, KnowledgeOutput, IntentOutput, ProfilingOutput, ConversationMessage } from "../utils/types.js";

export interface KnowledgeInput {
  message: string;
  intent?: IntentOutput;
  profiling?: ProfilingOutput;
  history?: ConversationMessage[];
}

export class KnowledgeAgent extends AgentBase<KnowledgeInput, typeof knowledgeSchema> {
  constructor(model: ChatOpenAI, promptPath: string) {
    super({ name: "KnowledgeAgent", model, promptPath, schema: knowledgeSchema });
  }

  async run(input: KnowledgeInput): Promise<KnowledgeOutput> {
    return this.callLLM<KnowledgeOutput>(input);
  }
}
