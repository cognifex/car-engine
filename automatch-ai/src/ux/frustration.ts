import { ClientEvent } from "../utils/types.js";

export type FrustrationSignals = {
  userMessage: string;
  intentType?: string;
  events?: ClientEvent[];
};

const frustrationKeywords = ["frust", "nerv", "funktioniert nicht", "geht nicht", "useless", "broken"];

export const detectFrustrationSignals = (signals: FrustrationSignals): { frustrated: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  const msg = (signals.userMessage || "").toLowerCase();

  if (frustrationKeywords.some((k) => msg.includes(k))) {
    reasons.push("keyword_match");
  }
  if (signals.intentType === "frustration" || signals.intentType === "feedback_negative") {
    reasons.push("intent_flag");
  }

  return { frustrated: reasons.length > 0, reasons };
};
