import { ChatOpenAI } from "@langchain/openai";
import { AgentBase } from "./AgentBase.js";
import { intentSchema, IntentOutput, ProfilingOutput, ConversationMessage } from "../utils/types.js";

export interface IntentInput {
  message: string;
  profiling?: ProfilingOutput;
  history?: ConversationMessage[];
}

export class IntentAgent extends AgentBase<IntentInput, typeof intentSchema> {
  constructor(model: ChatOpenAI, promptPath: string) {
    super({ name: "IntentAgent", model, promptPath, schema: intentSchema });
  }

  async run(input: IntentInput): Promise<IntentOutput> {
    return this.callLLM<IntentOutput>(input);
  }
}
