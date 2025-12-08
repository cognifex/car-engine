import { ChatOpenAI } from "@langchain/openai";
import { settings } from "../config/settings.js";
import { Offer } from "./types.js";

// Fetch additional background info for a model using LLM (can include web-style knowledge via the model),
// but only if the model is part of the current offers.
export async function fetchBackground(model: string, offers: Offer[], message: string, historyText: string): Promise<string> {
  const match = offers.find((o) => (o.model || "").toLowerCase() === model.toLowerCase() || (o.title || "").toLowerCase().includes(model.toLowerCase()));
  if (!match) return "";

  const llm = new ChatOpenAI({
    model: settings.OPENAI_MODEL,
    apiKey: settings.OPENAI_API_KEY,
    temperature: 0.3,
  });

  const prompt = `User asked for more info about the model "${match.model || match.title}" shown in offers.
Context you already have:
- User message: "${message}"
- History: "${historyText}"
- Offer badge: "${match.badge || ""}"
- Offer title: "${match.title || ""}"

Provide a concise (max 50 words) German background blurb: key strengths, tech highlights, safety/reliability notes if known, and typical use case. If uncertain, say so.`;

  const res = await llm.invoke(prompt);
  return res?.content?.toString() || "";
}
