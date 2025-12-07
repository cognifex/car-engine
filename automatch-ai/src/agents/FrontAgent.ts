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
}

export class FrontAgent extends AgentBase<FrontInput, typeof frontSchema> {
  constructor(model: ChatOpenAI, promptPath: string) {
    super({ name: "FrontAgent", model, promptPath, schema: frontSchema });
  }

  async run(input: FrontInput): Promise<FrontOutput> {
    return this.callLLM<FrontOutput>(input);
  }
}
