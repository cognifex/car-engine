import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { ChatOpenAI } from "@langchain/openai";
import { runPipeline } from "../dist/workflows/pipeline.js";
import { z } from "zod";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_CALLS = Number(process.env.SIM_MAX_CALLS || 60); // rough cap to keep cost low
const CALLS_PER_PIPELINE = Number(process.env.SIM_CALLS_PER_PIPELINE || 7); // profiling+intent+router+knowledge+profile+matching+front

type Role = "user" | "assistant";

interface Persona {
  name: string;
  description: string;
  entry: string;
  country?: string;
  maxTurns?: number;
}

interface ConversationTurn {
  user: string;
  assistant: string;
  offers: any[];
  visuals: string[];
  issues: string[];
  judge: { score: number; reason: string };
}

const personas: Persona[] = [
  {
    name: "BudgetKombiDE",
    description: "Sparsamer Käufer in Deutschland, will Kombi/SUV für Transport, Budget ca. 10-15k, offen für Gebrauchtwagen.",
    entry: "Hi, ich brauche ein günstiges Auto, manchmal mit Platz für größere Sachen.",
    country: "DE",
  },
  {
    name: "CityEV",
    description: "Stadtfahrer, neugierig auf E-Auto, kurze Strecken, wenig Technikkenntnis, Budget 20-30k.",
    entry: "Hallo, überlege ein Elektroauto für die Stadt. Keine Ahnung, was passt.",
    country: "DE",
  },
  {
    name: "ErstesAuto",
    description: "Junge Person, erstes Auto, unsicher, kleines Budget 6-9k, will einfache Hinweise, kein Fachjargon.",
    entry: "Hi, suche mein erstes Auto, nicht zu teuer.",
    country: "DE",
  },
];

const userModel = new ChatOpenAI({
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  temperature: 0.7,
});

const judgeModel = new ChatOpenAI({
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  temperature: 0,
});

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const isUSLocation = (loc: string) => /(^|\s|,)(us|usa|united states)/i.test(loc);

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

async function judgeSatisfaction(persona: Persona, history: { role: Role; content: string }[], offers: any[]): Promise<{ score: number; reason: string }> {
  const prompt = `
Du bewertest die Zufriedenheit eines Autokauf-Interessenten implizit anhand des Gesprächsverlaufs.
Persona: ${persona.description}
Verlauf (role: text):
${history.map(h => `${h.role}: ${h.content}`).join("\n")}
Angebote: ${offers.length} Stück.
Gib nur JSON: {"score": 0-1, "reason": "kurz"}.
Bewerte: Relevanz, Klarheit, Fortschritt Richtung passenden Autos, Ton.
  `.trim();

  const result = await judgeModel.withStructuredOutput(
    z.object({
      score: z.number().min(0).max(1),
      reason: z.string(),
    })
  ).invoke([{ role: "user", content: prompt }]);

  return result as any;
}

async function simulateUserReply(persona: Persona, history: { role: Role; content: string }[]): Promise<string> {
  const prompt = `
Du spielst einen Autokäufer. Persona: ${persona.description}
Du kennst nur, dass die App beim Autokauf hilft.
Antworte als normaler Nutzer, deutsch, kurz (max 18 Wörter), kein Meta.
Verlauf:
${history.map(h => `${h.role}: ${h.content}`).join("\n")}
Gib nur deine nächste Nachricht.
  `.trim();

  const reply = await userModel.invoke([
    { role: "system", content: "Antworte knapp wie ein echter Nutzer." },
    { role: "user", content: prompt },
  ]);
  return (reply.content as string).trim();
}

function hardChecks(text: string, offers: any[], country?: string): string[] {
  const issues: string[] = [];
  if (!text) issues.push("EMPTY_REPLY");
  if (wordCount(text) > 35) issues.push("WORD_LIMIT");
  if (offers.length === 0) issues.push("NO_OFFERS");
  if (offers.some(o => !o.vin)) issues.push("MISSING_VIN");
  if (country?.toLowerCase().includes("de") && offers.some(o => o.location && isUSLocation(o.location))) issues.push("US_LISTING");
  if (offers.some(o => !o.image_url)) issues.push("MISSING_IMAGE");
  return issues;
}

async function runSimulation(persona: Persona): Promise<{ persona: string; turns: ConversationTurn[] }> {
  const turns: ConversationTurn[] = [];
  const maxTurns = persona.maxTurns ?? 4;
  let history: { role: Role; content: string }[] = [];
  let userMessage = persona.entry;
  let remainingCalls = MAX_CALLS;

  for (let i = 0; i < maxTurns; i++) {
    if (remainingCalls < CALLS_PER_PIPELINE + 2) {
      console.warn(`Budget guard hit for ${persona.name}, stopping simulation (remaining calls ${remainingCalls})`);
      break;
    }
    // Push current user message into history for pipeline context
    const pipelineHistory = [...history];
    remainingCalls -= CALLS_PER_PIPELINE;
    const result = await runPipeline(userMessage, pipelineHistory);
    const botText = [result.response?.reply, result.response?.followUp].filter(Boolean).join(" ").trim();
    const offers = result.content?.offers || [];
    const visuals = result.content?.visuals || [];

    const issues = hardChecks(botText, offers, persona.country);
    history = [...history, { role: "user", content: userMessage }, { role: "assistant", content: botText }];

    remainingCalls -= 1;
    const judge = await judgeSatisfaction(persona, history, offers);

    turns.push({
      user: userMessage,
      assistant: botText,
      offers,
      visuals,
      issues,
      judge,
    });

    // Prepare next user message unless maxTurns reached
    if (i === maxTurns - 1) break;
    remainingCalls -= 1;
    userMessage = await simulateUserReply(persona, history);
  }

  return { persona: persona.name, turns };
}

async function main() {
  let callBudget = MAX_CALLS;
  const runs = Number(process.env.SIM_RUNS || personas.length);
  const selected = personas.slice(0, runs);
  const report: any = { generatedAt: new Date().toISOString(), runs: [] as any[] };

  for (const persona of selected) {
    if (callBudget < CALLS_PER_PIPELINE + 2) {
      console.warn(`Budget guard: stopping before persona ${persona.name}, remaining calls ${callBudget}`);
      break;
    }
    const sim = await runSimulation(persona);
    report.runs.push(sim);
    // Roughly decrement budget by turns * CALLS_PER_PIPELINE + judge/user; already accounted inside runSimulation.
    callBudget = callBudget - 0; // retained for clarity; guard handled inside.
  }

  ensureDir(path.join(__dirname, "..", "reports"));
  const file = path.join(__dirname, "..", "reports", `sim-report-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`Simulation report written to ${file}`);
}

main().catch((err) => {
  console.error("Simulation failed", err);
  process.exitCode = 1;
});
