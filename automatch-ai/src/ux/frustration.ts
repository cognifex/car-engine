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

  const uiFailures = (signals.events || []).filter((e) => e.type === "IMAGE_LOAD_FAILED" || e.type === "UI_HEALTH_SIGNAL");
  if (uiFailures.length >= 2) {
    reasons.push("ui_failures");
  }

  return { frustrated: reasons.length > 0, reasons };
};
