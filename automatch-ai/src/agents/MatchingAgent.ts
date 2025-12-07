import { ChatOpenAI } from "@langchain/openai";
import { AgentBase } from "./AgentBase.js";
import { matchSchema, MatchingOutput, IntentOutput, ProfilingOutput, ConversationMessage } from "../utils/types.js";

export interface MatchingInput {
  intent?: IntentOutput;
  profiling?: ProfilingOutput;
  history?: ConversationMessage[];
}

export class MatchingAgent extends AgentBase<MatchingInput, typeof matchSchema> {
  constructor(model: ChatOpenAI, promptPath: string) {
    super({ name: "MatchingAgent", model, promptPath, schema: matchSchema });
  }

  async run(input: MatchingInput): Promise<MatchingOutput> {
    return this.callLLM<MatchingOutput>(input);
  }
}
