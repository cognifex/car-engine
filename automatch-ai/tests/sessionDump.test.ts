import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { SessionDumpStore, SessionTraceCollector } from "../src/utils/sessionDump.js";
import { ConversationMessage, PerfectProfile, RouteDecision } from "../src/utils/types.js";

const buildProfile = (): PerfectProfile => ({
  budget: "20000",
  usage: "commute",
  passengers: "4",
  experience: "medium",
  segmentPrefs: ["SUV"],
  powertrainPrefs: ["hybrid"],
  constraints: [],
  knowledge_level: "medium",
  confidence: "medium",
  terrain: "city",
  drivetrain: "awd",
  bodyTypePreference: "SUV",
  robustness: "medium",
  use_case: "daily",
  offroadPriority: false,
});

const buildRoute = (): RouteDecision => ({
  includeKnowledge: true,
  includeVisuals: true,
  includeMatching: true,
  includeOffers: true,
  strictOffers: false,
  retryMatching: false,
});

describe("SessionTraceCollector", () => {
  it("persists a structured session dump", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-dump-"));
    const store = new SessionDumpStore(dir);
    const collector = new SessionTraceCollector({ sessionId: "test-session", modelId: "gpt-test", store });

    const history: ConversationMessage[] = [
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" },
    ];

    collector.startTurn({ userMessage: "Show me SUVs", history });
    collector.recordNode({ name: "profiling", input: { message: "Show me SUVs" }, output: { knowledge_level: "medium" }, startedAt: new Date(), endedAt: new Date() });
    collector.recordNode({ name: "intent", input: { message: "Show me SUVs" }, output: { intent: "car_search" }, startedAt: new Date(), endedAt: new Date() });

    collector.finishTurn({
      reply: "Here are some SUVs",
      followUp: "Want to filter by budget?",
      state: {
        intent: { intent: "car_search", fields: [{ key: "segment", value: "SUV" }] },
        profile: buildProfile(),
        route: buildRoute(),
        matches: { suggestions: [{ model: "Brand Model X", category: "SUV", reason: "Good for commute" }] },
        offers: [
          {
            title: "Brand Model X",
            model: "Brand Model X",
            price: 35000,
            dealer: "Example Dealer",
            link: "https://example.com",
            image_url: "",
            location: "",
            mileage: "",
            badge: "SUV • Hybrid",
            created_at: new Date().toISOString(),
            vin: "",
            isOffroadRelevant: false,
            isExactMatchToSuggestion: true,
            relevanceScore: 0.92,
            source: "test",
            fallbackReason: "",
          },
        ],
        offersMeta: { offersHistory: [{ timestamp: new Date().toISOString(), offers: [] }] },
        offerSearchState: { failureCount: 0 },
        content: { offers: [], visuals: [], definition: "" },
      },
    });

    collector.finalize();

    const dump = store.load("test-session");
    expect(dump).toBeTruthy();
    expect(dump?.conversation.length).toBeGreaterThan(0);
    expect(dump?.turns[0].nodes.length).toBeGreaterThan(0);
    expect(dump?.turns[0].routing?.includeOffers).toBe(true);
    expect(dump?.turns[0].matching?.suggestions[0].model).toContain("Brand Model X");
  });
});

