import { ChatOpenAI } from "@langchain/openai";
import { AgentBase } from "./AgentBase.js";
import { userCarProfileSchema, UserCarProfile, ProfilingOutput, IntentOutput, ConversationMessage } from "../utils/types.js";

export interface ProfileBuilderInput {
  message: string;
  profiling?: ProfilingOutput;
  intent?: IntentOutput;
  history?: ConversationMessage[];
}

export class ProfileBuilderAgent extends AgentBase<ProfileBuilderInput, typeof userCarProfileSchema> {
  constructor(model: ChatOpenAI, promptPath: string) {
    super({ name: "ProfileBuilderAgent", model, promptPath, schema: userCarProfileSchema });
  }

  async run(input: ProfileBuilderInput): Promise<UserCarProfile> {
    return this.callLLM<UserCarProfile>(input);
  }
}
