import { StateGraph, START, END } from "@langchain/langgraph";
import { ConversationState, AgentLogEntry } from "../utils/types.js";
import { ProfilingAgent } from "../agents/ProfilingAgent.js";
import { IntentAgent } from "../agents/IntentAgent.js";
import { RouterAgent } from "../agents/RouterAgent.js";
import { KnowledgeAgent } from "../agents/KnowledgeAgent.js";
import { VisualAgent } from "../agents/VisualAgent.js";
import { MatchingAgent } from "../agents/MatchingAgent.js";
import { FrontAgent } from "../agents/FrontAgent.js";
import { OfferAgent } from "../agents/OfferAgent.js";
import { aggregateContent } from "../agents/ContentAggregator.js";
import { ProfileBuilderAgent } from "../agents/ProfileBuilderAgent.js";

export interface AgentBundle {
  profiling: ProfilingAgent;
  intent: IntentAgent;
  router: RouterAgent;
  knowledge: KnowledgeAgent;
  visual: VisualAgent;
  matching: MatchingAgent;
  offers: OfferAgent;
  profileBuilder: ProfileBuilderAgent;
  front: FrontAgent;
}

type GraphState = ConversationState & Record<string, unknown>;

export const buildGraph = (agents: AgentBundle) => {
  const graph = new StateGraph<GraphState>({
    channels: {
      userMessage: null,
      history: null,
      profiling: null,
      intent: null,
      route: null,
      knowledge: null,
      visuals: null,
      matches: null,
      offers: null,
      content: null,
      profile: null,
      response: null,
      debugLogs: null,
    },
  });

  const withLog = (state: GraphState, entry: AgentLogEntry) => ({
    debugLogs: [...(state.debugLogs || []), entry],
  });

  graph.addNode("profilingNode", async (state: GraphState) => {
    const input = { message: state.userMessage, history: state.history || [] };
    const output = await agents.profiling.run(input);
    return {
      profiling: output,
      ...withLog(state, { agent: "profiling", input, output: output as Record<string, unknown> }),
    };
  });

  graph.addNode("intentNode", async (state: GraphState) => {
    const input = {
      message: state.userMessage,
      profiling: state.profiling,
      history: state.history,
    };
    const output = await agents.intent.run(input);
    return {
      intent: output,
      ...withLog(state, { agent: "intent", input: input as Record<string, unknown>, output: output as Record<string, unknown> }),
    };
  });

  graph.addNode("routerNode", async (state: GraphState) => {
    const input = {
      message: state.userMessage,
      profiling: state.profiling,
      intent: state.intent,
      history: state.history,
    };
    const output = await agents.router.run(input);
    // If user asked for retro/oldtimer, force offers on.
    const lowerMsg = (state.userMessage || "").toLowerCase();
    const retroFlag = lowerMsg.includes("retro") || lowerMsg.includes("oldtimer") || lowerMsg.includes("klassik") || lowerMsg.includes("vintage") || lowerMsg.includes("youngtimer");
    const vagueFlag = (state.intent?.intent === "needs_clarification");
    const patchedRoute = retroFlag || vagueFlag ? { ...output, includeOffers: true, includeMatching: false } : output;
    return {
      route: patchedRoute,
      ...withLog(state, { agent: "router", input: input as Record<string, unknown>, output: patchedRoute as Record<string, unknown> }),
    };
  });

  graph.addNode("knowledgeNode", async (state: GraphState) => {
    if (state.route?.includeKnowledge === false) return {};
    const input = {
      message: state.userMessage,
      intent: state.intent,
      profiling: state.profiling,
      history: state.history,
    };
    const output = await agents.knowledge.run(input);
    return {
      knowledge: output,
      ...withLog(state, { agent: "knowledge", input: input as Record<string, unknown>, output: output as Record<string, unknown> }),
    };
  });

  graph.addNode("profileNode", async (state: GraphState) => {
    const input = {
      message: state.userMessage,
      profiling: state.profiling,
      intent: state.intent,
      history: state.history,
    };
    const output = await agents.profileBuilder.run(input);
    return {
      profile: output,
      ...withLog(state, { agent: "profileBuilder", input: input as Record<string, unknown>, output: output as Record<string, unknown> }),
    };
  });

  graph.addNode("visualNode", async (state: GraphState) => {
    if (state.route?.includeVisuals === false) return {};
    const input = { intent: state.intent, knowledge: state.knowledge, history: state.history };
    const output = await agents.visual.run(input);
    return {
      visuals: output,
      ...withLog(state, { agent: "visual", input: input as Record<string, unknown>, output: output as Record<string, unknown> }),
    };
  });

  graph.addNode("matchingNode", async (state: GraphState) => {
    if (state.route?.includeMatching === false) return {};
    const input = {
      intent: state.intent,
      profiling: state.profiling,
      history: state.history,
    };
    const output = await agents.matching.run(input);
    return {
      matches: output,
      ...withLog(state, { agent: "matching", input: input as Record<string, unknown>, output: output as Record<string, unknown> }),
    };
  });

  graph.addNode("offerNode", async (state: GraphState) => {
    if (state.route?.includeOffers === false) return {};
    const matchModel = state.matches?.suggestions?.[0]?.model;
    const modelParts = matchModel ? matchModel.split(" ") : [];
    const brandGuess = modelParts[0];
    const modelGuess = modelParts.slice(1).join(" ");
    const input = {
      intent: state.intent?.intent,
      fields: state.intent?.fields,
      profiling: state.profiling,
      brand: state.intent?.fields?.find(f => f.key === "brand")?.value || brandGuess,
      model: state.intent?.fields?.find(f => f.key === "model")?.value || modelGuess,
      matchModel,
      userMessage: state.userMessage,
      history: state.history,
    };
    const output = await agents.offers.run(input as any);
    return {
      offers: output.offers,
      ...withLog(state, { agent: "offers", input: input as Record<string, unknown>, output: output as Record<string, unknown> }),
    };
  });

  graph.addNode("contentNode", async (state: GraphState) => {
    const visuals = state.visuals?.image_urls || [];
    const offers = state.offers || [];
    const definition = state.knowledge?.explanation || "";
    const aggregated = aggregateContent({ offers, visuals, knowledgeText: definition });
    return {
      content: aggregated,
      ...withLog(state, { agent: "contentAggregator", input: { offers, visuals, definition } as Record<string, unknown>, output: aggregated as Record<string, unknown> }),
    };
  });

  graph.addNode("frontNode", async (state: GraphState) => {
    const input = {
      message: state.userMessage,
      profiling: state.profiling,
      intent: state.intent,
      knowledge: state.knowledge,
      visuals: state.visuals,
      matches: state.matches,
      offers: state.offers,
      profile: state.profile,
      history: state.history,
      debugLogs: state.debugLogs,
    };
    const output = await agents.front.run(input);
    return {
      response: output,
      ...withLog(state, { agent: "front", input: input as Record<string, unknown>, output: output as Record<string, unknown> }),
    };
  });

  graph.addEdge(START, "profilingNode" as any);
  graph.addEdge("profilingNode" as any, "intentNode" as any);
  graph.addEdge("intentNode" as any, "routerNode" as any);
  graph.addEdge("routerNode" as any, "knowledgeNode" as any);
  graph.addEdge("knowledgeNode" as any, "profileNode" as any);
  graph.addEdge("profileNode" as any, "visualNode" as any);
  graph.addEdge("visualNode" as any, "matchingNode" as any);
  graph.addEdge("matchingNode" as any, "offerNode" as any);
  graph.addEdge("offerNode" as any, "contentNode" as any);
  graph.addEdge("contentNode" as any, "frontNode" as any);
  graph.addEdge("frontNode" as any, END);

  return graph.compile();
};
