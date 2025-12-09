## Agent Orchestration Snapshot (AutoMatch AI)

- **Roles**
  - *Planner*: baut die Schrittfolge basierend auf Intent + Memory (`plannerNode`, `buildPlannerDecision`).
  - *Conversation/Intent*: versteht Stimmung + Präferenzen (`intentParserNode`, `PreferenceConstraintState`).
  - *Tooling/Execution*: holt Katalog-Entities, filtert sie, berechnet Content-State (`executionNode`).
  - *Evaluator/Guardrail*: bewertet Qualität, UI-Gesundheit, Frustration (`evaluationNode`, `uiHealthPolicyNode`).
  - *Front Persona*: setzt Tonfall/Vibe und Follow-up (`responseNode`, `ux/persona.ts`).
  - *Memory*: Kurzzeit-/Working-/Langzeit-Speicher pro Session (`memoryBootstrapNode`, `memoryPersistNode`, `memory/memory.ts`).

- **Workflow (StateGraph)**
  1. **memoryBootstrapNode** – lädt Kurzzeit-/Working-Memory, füllt History, hält Preference-State warm.
  2. **clientEventNode** – fasst UI-Signale zusammen (Netzwerk, Asset-Fails, Visibility).
  3. **intentParserNode** – heuristische Intent-/Frust-Erkennung, Preference-Signale.
  4. **plannerNode** – erzeugt einen expliziten Plan (Profile sammeln → Tooling → Evaluation → Front).
  5. **executionNode** – führt Plan aus: Preferences updaten, Katalog filtern, Routing-Policy anwenden.
  6. **uiHealthPolicyNode** – leitet UI-Gesundheit in Recovery-Instruktionen ab.
  7. **evaluationNode** – fasst Qualität/Frust/Recovery zu Evaluationsnoten zusammen, triggert Reflection.
  8. **responseNode** – finalisiert Content + Persona-Ton, folgt Plan-Hinweisen, reduziert Visuals bei Bedarf.
  9. **memoryPersistNode** – schreibt neue Kurzzeitfenster + Working-/Langzeit-Memory pro Session.

- **Memory Layer**
  - *ShortTerm*: begrenztes Fenster von Chat-Messages (default 12).
  - *Working*: strukturierte Präferenzen (Produkt/Conversation/Style).
  - *LongTerm*: Reflection-Notizen, Plan-Hints, Frustrationszähler, UI-Health-Notizen.
  - Persistiert in `data/memory/<sessionId>.json` über `MemoryManager`.

- **UX & Vibe**
  - Persona in `ux/persona.ts`, wendet warmen Ton, Plan-Hints und Frust-Playbook an.
  - Frustrationssignale in `ux/frustration.ts`, kombiniert Intent + Client-Events.

- **Observability**
  - Jede Node schreibt `debugLogs` + `SessionTraceCollector`-Einträge.
  - Reflection-Notizen in `data/reflections.json`, Session-Dumps in `data/session-dumps`.
