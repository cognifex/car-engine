import { ChatOpenAI } from "@langchain/openai";
import { AgentBase } from "./AgentBase.js";
import { routeSchema, RouteDecision, IntentOutput, ProfilingOutput, ConversationMessage } from "../utils/types.js";

export interface RouterInput {
  message: string;
  profiling?: ProfilingOutput;
  intent?: IntentOutput;
  history?: ConversationMessage[];
}

export class RouterAgent extends AgentBase<RouterInput, typeof routeSchema> {
  constructor(model: ChatOpenAI, promptPath: string) {
    super({ name: "RouterAgent", model, promptPath, schema: routeSchema });
  }

  async run(input: RouterInput): Promise<RouteDecision> {
    return this.callLLM<RouteDecision>(input);
  }
}
