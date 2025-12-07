import { ChatOpenAI } from "@langchain/openai";
import { AgentBase } from "./AgentBase.js";
import { profilingSchema, ProfilingOutput, ConversationMessage } from "../utils/types.js";

export interface ProfilingInput {
  message: string;
  history?: ConversationMessage[];
}

export class ProfilingAgent extends AgentBase<ProfilingInput, typeof profilingSchema> {
  constructor(model: ChatOpenAI, promptPath: string) {
    super({ name: "ProfilingAgent", model, promptPath, schema: profilingSchema });
  }

  async run(input: ProfilingInput): Promise<ProfilingOutput> {
    return this.callLLM<ProfilingOutput>(input);
  }
}
