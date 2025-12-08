import { z } from "zod";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentLogEntry = {
  agent: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
};

export const profilingSchema = z.object({
  knowledge_level: z.enum(["low", "medium", "high"]),
  confidence: z.enum(["low", "medium", "high"]),
  tone: z.enum(["neutral", "casual", "formal"]),
});
export type ProfilingOutput = z.infer<typeof profilingSchema>;

export const intentSchema = z.object({
  intent: z.enum([
    "needs_clarification",
    "budget_info",
    "car_search",
    "explanation_request",
    "refine_requirements",
    "dissatisfaction",
    "unknown",
  ]),
  fields: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    })
  ).default([]),
});
export type IntentOutput = z.infer<typeof intentSchema>;

export const knowledgeSchema = z.object({
  explanation: z.string().describe("Short, plain explanation"),
});
export type KnowledgeOutput = z.infer<typeof knowledgeSchema>;

export const visualSchema = z.object({
  image_urls: z.array(z.string()).min(1),
});
export type VisualOutput = z.infer<typeof visualSchema>;

export const matchSchema = z.object({
  suggestions: z.array(
    z.object({
      model: z.string(),
      category: z.string(),
      reason: z.string(),
    })
  ).min(1).max(3),
});
export type MatchingOutput = z.infer<typeof matchSchema>;

export const frontSchema = z.object({
  reply: z.string().describe("User-facing message in plain text"),
  followUp: z.string().default(""),
});
export type FrontOutput = z.infer<typeof frontSchema>;

export const routeSchema = z.object({
  includeKnowledge: z.boolean(),
  includeVisuals: z.boolean(),
  includeMatching: z.boolean(),
  includeOffers: z.boolean(),
  strictOffers: z.boolean().default(false),
  retryMatching: z.boolean().default(false),
});
export type RouteDecision = z.infer<typeof routeSchema>;

export const perfectProfileSchema = z.object({
  budget: z.string().default(""),
  usage: z.string().default(""),
  passengers: z.string().default(""),
  experience: z.string().default(""),
  segmentPrefs: z.array(z.string()).default([]),
  powertrainPrefs: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  knowledge_level: z.enum(["low", "medium", "high"]).default("medium"),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  terrain: z.string().default(""),
  drivetrain: z.string().default(""),
  bodyTypePreference: z.string().default(""),
  robustness: z.string().default(""),
  use_case: z.string().default(""),
  offroadPriority: z.boolean().default(false),
});
export type PerfectProfile = z.infer<typeof perfectProfileSchema>;

export const OfferType = z.object({
  title: z.string(),
  model: z.string().default(""),
  price: z.number().nonnegative().default(0),
  dealer: z.string().default(""),
  link: z.string().default(""),
  image_url: z.string().default(""),
  location: z.string().default(""),
  mileage: z.union([z.number(), z.string()]).default(""),
  badge: z.string().default(""),
  created_at: z.string().default(""),
  vin: z.string().default(""),
  isOffroadRelevant: z.boolean().default(false),
  isExactMatchToSuggestion: z.boolean().default(false),
  relevanceScore: z.number().default(0),
  source: z.string().default(""),
  fallbackReason: z.string().default(""),
});
export type Offer = z.infer<typeof OfferType>;

export const OfferListSchema = z.object({
  offers: z.array(OfferType),
});

export const contentSchema = z.object({
  offers: z.array(OfferType).default([]),
  visuals: z.array(z.string()).default([]),
  definition: z.string().default(""),
  matches: matchSchema.optional(),
  profile: perfectProfileSchema.optional(),
  offerDiagnostics: z
    .object({
      queryModels: z.array(z.string()).default([]),
      offroadRequired: z.boolean().default(false),
      fallbackUsed: z.boolean().default(false),
      noRelevantOffers: z.boolean().default(false),
      strategy: z.string().default(""),
      failureCount: z.number().default(0),
      relevance: z
        .array(
          z.object({
            model: z.string().default(""),
            isOffroadRelevant: z.boolean().default(false),
            isExactMatchToSuggestion: z.boolean().default(false),
            relevanceScore: z.number().default(0),
          })
        )
        .default([]),
    })
    .optional(),
});
export type ContentPayload = z.infer<typeof contentSchema>;

export interface ConversationState {
  userMessage: string;
  history?: ConversationMessage[];
  profiling?: ProfilingOutput;
  intent?: IntentOutput;
  knowledge?: KnowledgeOutput;
  visuals?: VisualOutput;
  matches?: MatchingOutput;
  route?: RouteDecision;
  response?: FrontOutput;
  offers?: Offer[];
  content?: ContentPayload;
   profile?: PerfectProfile;
  offersMeta?: Record<string, unknown>;
  offerSearchState?: { failureCount?: number; lastStrategy?: string };
  debugLogs?: AgentLogEntry[];
}
