import { ChatOpenAI } from "@langchain/openai";
import path from "path";
import { settings } from "../config/settings.js";
import { logger } from "../utils/logger.js";
import { PROMPTS_DIR } from "../utils/paths.js";
import { ProfilingAgent } from "../agents/ProfilingAgent.js";
import { IntentAgent } from "../agents/IntentAgent.js";
import { RouterAgent } from "../agents/RouterAgent.js";
import { KnowledgeAgent } from "../agents/KnowledgeAgent.js";
import { VisualAgent } from "../agents/VisualAgent.js";
import { MatchingAgent } from "../agents/MatchingAgent.js";
import { OfferAgent } from "../agents/OfferAgent.js";
import { ProfileBuilderAgent } from "../agents/ProfileBuilderAgent.js";
import { FrontAgent } from "../agents/FrontAgent.js";
import { buildGraph } from "./graph.js";
import { ConversationState, ConversationMessage } from "../utils/types.js";

export const createModel = () =>
  new ChatOpenAI({
    model: settings.OPENAI_MODEL,
    apiKey: settings.OPENAI_API_KEY,
    temperature: 0.2,
  });

export const createAgents = () => {
  const model = createModel();
  const prompt = (file: string) => path.join(PROMPTS_DIR, file);

  return {
    profiling: new ProfilingAgent(model, prompt("profiling.md")),
    intent: new IntentAgent(model, prompt("intent.md")),
    router: new RouterAgent(model, prompt("router.md")),
    knowledge: new KnowledgeAgent(model, prompt("knowledge.md")),
    visual: new VisualAgent(model, prompt("visual.md")),
    matching: new MatchingAgent(model, prompt("matching.md")),
    offers: new OfferAgent(),
    profileBuilder: new ProfileBuilderAgent(model, prompt("profile.md")),
    front: new FrontAgent(model, prompt("front.md")),
  };
};

export const runPipeline = async (userMessage: string, history: ConversationMessage[] = []): Promise<ConversationState> => {
  const agents = createAgents();
  const graph = buildGraph(agents);

  const initialState: ConversationState = {
    userMessage,
    history,
    debugLogs: [],
  };

  logger.info({ userMessage }, "Starting AutoMatch AI graph run");
  const result = await graph.invoke(initialState as any);
  const merged: ConversationState = { ...initialState, ...(result as Record<string, unknown>) } as ConversationState;
  logger.info({ response: merged.response }, "Finished graph run");
  return merged;
};
