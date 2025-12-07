import { StateGraph, START, END } from "@langchain/langgraph";
import { ConversationState } from "../utils/types.js";
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
    },
  });

  graph.addNode("profilingNode", async (state: GraphState) => ({
    profiling: await agents.profiling.run({ message: state.userMessage, history: state.history }),
  }));

  graph.addNode("intentNode", async (state: GraphState) => ({
    intent: await agents.intent.run({
      message: state.userMessage,
      profiling: state.profiling,
      history: state.history,
    }),
  }));

  graph.addNode("routerNode", async (state: GraphState) => ({
    route: await agents.router.run({
      message: state.userMessage,
      profiling: state.profiling,
      intent: state.intent,
      history: state.history,
    }),
  }));

  graph.addNode("knowledgeNode", async (state: GraphState) => {
    if (state.route?.includeKnowledge === false) return {};
    return {
      knowledge: await agents.knowledge.run({
        message: state.userMessage,
        intent: state.intent,
        profiling: state.profiling,
        history: state.history,
      }),
    };
  });

  graph.addNode("profileNode", async (state: GraphState) => ({
    profile: await agents.profileBuilder.run({
      message: state.userMessage,
      profiling: state.profiling,
      intent: state.intent,
      history: state.history,
    }),
  }));

  graph.addNode("visualNode", async (state: GraphState) => {
    if (state.route?.includeVisuals === false) return {};
    return {
      visuals: await agents.visual.run({ intent: state.intent, knowledge: state.knowledge, history: state.history }),
    };
  });

  graph.addNode("matchingNode", async (state: GraphState) => {
    if (state.route?.includeMatching === false) return {};
    return {
      matches: await agents.matching.run({
        intent: state.intent,
        profiling: state.profiling,
        history: state.history,
      }),
    };
  });

  graph.addNode("offerNode", async (state: GraphState) => {
    if (state.route?.includeOffers === false) return {};
    const matchModel = state.matches?.suggestions?.[0]?.model;
    const modelParts = matchModel ? matchModel.split(" ") : [];
    const brandGuess = modelParts[0];
    const modelGuess = modelParts.slice(1).join(" ");
    return {
      offers: (await agents.offers.run({
        intent: state.intent?.intent,
        fields: state.intent?.fields,
        profiling: state.profiling,
        brand: state.intent?.fields?.find(f => f.key === "brand")?.value || brandGuess,
        model: state.intent?.fields?.find(f => f.key === "model")?.value || modelGuess,
        matchModel,
        userMessage: state.userMessage,
        history: state.history,
      })).offers,
    };
  });

  graph.addNode("contentNode", async (state: GraphState) => {
    const visuals = state.visuals?.image_urls || [];
    const offers = state.offers || [];
    const definition = state.knowledge?.explanation || "";
    return { content: aggregateContent({ offers, visuals, knowledgeText: definition }) };
  });

  graph.addNode("frontNode", async (state: GraphState) => ({
    response: await agents.front.run({
      message: state.userMessage,
      profiling: state.profiling,
      intent: state.intent,
      knowledge: state.knowledge,
      visuals: state.visuals,
      matches: state.matches,
      offers: state.offers,
      profile: state.profile,
      history: state.history,
    }),
  }));

  graph.addEdge(START, "profilingNode" as any);
  graph.addEdge("profilingNode" as any, "intentNode" as any);
  graph.addEdge("intentNode" as any, "routerNode" as any);
  graph.addEdge("routerNode" as any, "knowledgeNode" as any);
  graph.addEdge("knowledgeNode" as any, "profileNode" as any);
  graph.addEdge("knowledgeNode" as any, "visualNode" as any);
  graph.addEdge("visualNode" as any, "matchingNode" as any);
  graph.addEdge("matchingNode" as any, "offerNode" as any);
  graph.addEdge("offerNode" as any, "contentNode" as any);
  graph.addEdge("contentNode" as any, "frontNode" as any);
  graph.addEdge("frontNode" as any, END);

  return graph.compile();
};
