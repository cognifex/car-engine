import { ChatOpenAI } from "@langchain/openai";
import { AgentBase } from "./AgentBase.js";
import { perfectProfileSchema, PerfectProfile, ProfilingOutput, IntentOutput, ConversationMessage } from "../utils/types.js";

export interface ProfileBuilderInput {
  message: string;
  profiling?: ProfilingOutput;
  intent?: IntentOutput;
  history?: ConversationMessage[];
}

export class ProfileBuilderAgent extends AgentBase<ProfileBuilderInput, typeof perfectProfileSchema> {
  constructor(model: ChatOpenAI, promptPath: string) {
    super({ name: "ProfileBuilderAgent", model, promptPath, schema: perfectProfileSchema });
  }

  async run(input: ProfileBuilderInput): Promise<PerfectProfile> {
    return this.callLLM<PerfectProfile>(input);
  }
}
