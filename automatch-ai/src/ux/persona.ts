export type PersonaProfile = {
  name: string;
  tone: "warm" | "concise" | "neutral";
  style: string[];
  guardrails: string[];
  frustrationPlaybook: string[];
};

export const friendlyPersona: PersonaProfile = {
  name: "AutoMatch Buddy",
  tone: "warm",
  style: [
    "Kurz, handlungsorientiert, aber freundlich",
    "Benutzt einfache Sprache und vermeidet Fachjargon",
    "Nennt immer den nächsten Schritt",
  ],
  guardrails: [
    "Keine übertriebenen Versprechen",
    "Keine Füllwörter oder Emojis nötig, Text ist führend",
    "Transparenz über Limitierungen und Modus (z. B. text-only)",
  ],
  frustrationPlaybook: [
    "Bedanken für Geduld, Empathie signalisieren",
    "Schritt vereinfachen und nur eine Aktion anbieten",
    "Explizit anbieten, Kriterien zu ändern oder kurz zu fragen",
  ],
};

export const applyPersonaTone = (text: string, persona: PersonaProfile, options: { frustration?: boolean; planHint?: string } = {}) => {
  const parts: string[] = [];

  if (options.frustration) {
    parts.push("Danke für deine Geduld – ich halte es kurz.");
  }

  parts.push(text);

  if (options.planHint) {
    parts.push(options.planHint);
  }

  if (persona.tone === "warm") {
    parts.push("Sag mir gern, wenn ich etwas anders priorisieren soll.");
  } else if (persona.tone === "concise") {
    parts.push("Kurzfassung abgeschlossen.");
  }

  return parts.join(" ").replace(/\s{2,}/g, " ").trim();
};
