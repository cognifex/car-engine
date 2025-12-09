# UI-Health-aware Agentic Workflow (Domain-neutral)

## 1. UI Finite-State Machine (FSM)
### States
- **NORMAL**: Keine wesentlichen UI-Einschränkungen; volle Interaktion erwartet.
- **DEGRADED_NONBLOCKING**: UI-Probleme vorhanden, Interaktion ist möglich, aber eingeschränkt oder unsicher.
- **DEGRADED_BLOCKING**: UI-Probleme verhindern sichere Interaktion; Eingabe/Ergebnisdarstellung gelten als nicht gewährleistet.

### Events (aus dem Frontend gemeldet)
- `LAYOUT_OVERFLOW_DETECTED`: Haupt-Container breiter als Viewport oder horizontales Scrollen notwendig.
- `CLICK_TARGET_TOO_SMALL`: Touch-/Klick-Ziele <44×44 px oder nicht erreichbar.
- `INPUT_OBSTRUCTED`: Eingabefeld verdeckt, nicht fokussierbar oder nicht lesbar.
- `RESULTS_NOT_VISIBLE`: Ergebnis- oder Chat-Container nicht sichtbar, z. B. hinter Offcanvas oder durch Overflow/Positioning.
- `NO_SCROLL_PROGRESS`: Scrollen blockiert oder Positionsänderung nach Interaktion fehlgeschlagen.
- `STALLING_RENDERS`: Wiederholte Layout-Shifts (>N in T Sekunden) oder fehlende Stabilisierung nach Reflow.
- `RECOVERY_SIGNAL`: Frontend meldet erfolgreiche Selbstheilung (Remount/Reset) und stabile Metriken.

### Metriken, die ausgewertet werden
- Sichtbarkeit und Breite des Chat-/Result-Containers (kein horizontaler Scrollbedarf, innerhalb des Viewports).
- Erreichbarkeit und Größe des Haupteingabefelds (≥44×44 px, fokussierbar, nicht verdeckt).
- Scrollbarkeit in Haupt-Content-Bereichen (keine blockierenden Overlays, Fokus-Fallen).
- Layout-Stabilität (Anzahl/Layout-Shift-Ereignisse in einem Zeitfenster).

### Transition-Policy (Beispiele)
| Current State | Event | Target State | Severity | Gründe/Aktion |
| --- | --- | --- | --- | --- |
| NORMAL | LAYOUT_OVERFLOW_DETECTED \| RESULTS_NOT_VISIBLE | DEGRADED_NONBLOCKING | warning | Ergebnisse drohen unsichtbar zu werden; schmale/kompakte Antworten wählen. |
| NORMAL | INPUT_OBSTRUCTED \| CLICK_TARGET_TOO_SMALL | DEGRADED_BLOCKING | critical | Eingabe nicht bedienbar; Text-only erzwingen, Self-Healing triggern. |
| NORMAL | STALLING_RENDERS \| NO_SCROLL_PROGRESS (anhaltend) | DEGRADED_NONBLOCKING | warning | Stabilisierung abwarten, kompakt rendern. |
| DEGRADED_NONBLOCKING | INPUT_OBSTRUCTED | DEGRADED_BLOCKING | critical | Wechsel in Blockier-Status wegen Eingabeproblemen. |
| DEGRADED_NONBLOCKING | RESULTS_NOT_VISIBLE (persistierend) | DEGRADED_BLOCKING | critical | Keine sichtbaren Ergebnisse trotz Maßnahmen. |
| DEGRADED_NONBLOCKING | RECOVERY_SIGNAL | NORMAL | info | UI stabilisiert, volle Darstellung wieder erlauben. |
| DEGRADED_BLOCKING | RECOVERY_SIGNAL (mind. zwei stabile Pings) | DEGRADED_NONBLOCKING | warning | Vorsichtiger Re-Enable, weiterhin kompakte Layouts. |
| DEGRADED_BLOCKING | STALLING_RENDERS erneut | DEGRADED_BLOCKING | critical | Blockiert bleiben, weitere Self-Healing-Versuche anstoßen. |

### Severity-Mapping
- `info`: Keine oder nur minimale Hinweise; normales Rendern erlaubt.
- `warning`: UI eingeschränkt; kompakte/vereinfachte Layouts, visuelle Elemente sparsam.
- `critical`: Interaktion blockiert oder Ergebnisse nicht sichtbar; Text-only, Self-Healing aktiv, Eingaben vorsichtig entgegennnehmen.

## 2. Agentischer Workflow & Node-Spezifikation
### Abstrakte Nodes
1. **intentParser**
   - **Input**: User-Message, optional UI-State-Snapshot (Viewports, Messwerte der Health-Heuristiken).
   - **Output**: Intent (inkl. Meta-Intents wie Affirmation/Phatic/Continue), Confidence, benötigte Entitäten/Visualisierungswünsche.
2. **entityRetriever**
   - **Aktivierung**: Nur bei inhaltlicher Anfrage (kein reines Affirmation/Phatic).
   - **Input**: Intent + extrahierte Entitäten/Slots.
   - **Output**: Abstrakte Items/Offers/Entries (domain-neutral) mit Attributen für kompakte/visuelle Darstellung.
3. **router**
   - **Input**: Intent, Retriever-Ergebnis (optional), UI-Health-Status.
   - **Output**: Routing-Plan (z. B. `useKnowledge`, `useVisuals`, `useOffers`, `textOnly`, Layout-Präferenzen), inkl. Auswahl der Response-Strategie.
4. **uiHealth (Health-Node)**
   - **Input**: FSM-Events aus dem Frontend, vorliegender Node-Kontext (Intent/Route), historische Health-Messwerte.
   - **Output** (an Folge-Nodes): Aggregierter Health-Status `{ degraded_mode, render_text_only, severity, resultsVisible, recoveryHint, layoutHints }`.
5. **responseComposer**
   - **Input**: Routing-Plan, UI-Health-Status, (optionale) Entities/Offers, Intent-Meta.
   - **Output**: Gerenderte Antwort-Struktur für das Frontend, mit gewähltem Layout-Level (voll, kompakt, text-only) und Fallback-Blöcken.

### Policies & Abhängigkeiten
- **Decision-Policy**:
  - Wenn `uiHealth.degraded_mode == true` **oder** `resultsVisible == false`: `render_text_only = true`; keine Grids/Breiten-Treiber; nur einfache Listen/Absätze.
  - Wenn `uiHealth.severity == "info"`: volle Layouts möglich, aber Kompaktmodus optional konfigurierbar.
- **Router nutzt UI-Health**:
  - Bei `critical` zwingend: Text-only, Self-Healing-Hinweis, Retry-freundliche Texte.
  - Bei `warning`: Kompakte Karten/Listen, begrenzte Medien, keine breiten Komponenten.
  - Bei `info`: Normale Darstellung, aber responsive Limits (max-width 100%, Breakpoints für sm/md/lg).

## 3. Routing-Logik (Intent × UI-Health × Entity-Retrieval)
- **Intent-Check**: Affirmation/Phatic/Continue → Überspringe `entityRetriever`, gehe direkt zu `responseComposer` mit einfachem Text (respektiert UI-Health).
- **Entity-Retrieval**: Nur bei inhaltlichen Intents. Wenn `uiHealth.render_text_only`, liefere Entities in kompaktem Schema (Titel, 1–2 Attribute, Handlungslink als Text).
- **Visual Policy**:
  - `critical`: Kein Grid, keine großen Karten; einfache Bullet-Listen oder nummerierte Schritte.
  - `warning`: Single-column Karten/Listen mit reduzierten Attributen; klare max-width; keine Side-by-Side-Layouts.
  - `info`: Darf reichhaltiger rendern, aber stets responsive (sm-first, max-width 100%, keine horizontalen Scrolls).
- **Result-Safety**: Wenn `resultsVisible == false`, erzwinge Zusammenfassung + Hinweis auf vereinfachten Modus; keine Annahme über sichtbare Components treffen.

## 4. Degraded Mode & Text-only-Fallback
- **Auslöser**: `DEGRADED_BLOCKING` oder `resultsVisible == false` oder `render_text_only == true` aus Health-Node.
- **Strategie**:
  - Antwort als reine Text-Blöcke mit klaren Überschriften und nummerierten Schritten.
  - Einfache Listen (max. eine Ebene), kurze Absätze, keine Bilder/Grids/Carousels.
  - Optional Hinweis: "Vereinfachter Modus aktiv. Darstellung komprimiert." (domain-neutral).
  - Alle Interaktionsaufforderungen als Klartext (z. B. "Antworte mit ..."), keine Buttons/Chips erforderlich.
- **Persistenz**: Im Zustand `DEGRADED_BLOCKING` bleiben Antworten text-only, bis `RECOVERY_SIGNAL` zwei stabile Health-Pings liefert.

## 5. Frontend Self-Healing & Kommunikation
- **Erkennung (Heuristiken)**:
  - Verhältnis Haupt-Container-Breite zu Viewport; horizontales Scrollen oder Overflow.
  - Sichtbarkeit des Chat-/Result-Containers (Intersection/Bounding-Checks), Fokusierbarkeit der Eingabe.
  - Scroll-Fortschritt nach Benutzeraktion; anhaltende Layout-Shifts.
- **Maßnahmen bei kritischem Zustand**:
  - Reset relevanter Layout-Properties (z. B. max-width, overflow-x hidden) und Remount der Chat-Komponenten.
  - Re-Initialisierung der Input-Fokussierung; Entfernen blockierender Overlays/Scroll-Locks.
  - Kurze Meldung, dass vereinfachter Modus aktiv ist; danach Health-Pings senden.
- **Kommunikation Frontend → Backend**:
  - Event-Stream oder periodische Health-Pings mit `{ eventType, metrics, timestamp, viewport }`.
  - FSM-Events triggert der Health-Node; aggregierter Status wird im Workflow weitergereicht.
- **Kommunikation Backend → Frontend**:
  - Jede Antwort trägt Health-Metadaten `{ degraded_mode, render_text_only, severity, recoveryHint }`.
  - Frontend kann darauf basierend einen simplen Renderer aktivieren und Self-Healing erneut versuchen, falls `critical`.

## 6. Konfiguration & Domain-Neutralität
- **Konfigurierbare Schwellen**:
  - Anzahl erlaubter Layout-Shifts in Zeitfenster T.
  - Minimale Touch-Target-Größe, erlaubte Overflow-Margen.
  - Zeit ohne Scroll-/Fokus-Progress, ab der `RESULTS_NOT_VISIBLE` angenommen wird.
- **Darstellungs-Policies**:
  - Max. Anzahl visualisierter Items pro Antwort; Medien optional, immer abschaltbar.
  - Layout-Level (`full`, `compact`, `text-only`) als konfigurierbare Profile.
  - Self-Healing-Strategie (Remount vs. Soft-Reset) als Option.
- **Stack-Unabhängigkeit (Pattern-Ebene)**:
  - FSM/Health als eigenständiger Service/Hook/Store mit Event-Reducer; keine Framework-Bindung.
  - Renderer nutzt deklarative Layout-Profile (Text/Compact/Full) und responsive Utility-Klassen; Mobile-First (sm→md→lg) mit max-width 100% und Overflow-Schutz.
  - Backend-Workflow als Pipeline/Graph mit klaren Inputs/Outputs (Intent, Entities, UI-Health, Route); austauschbare Implementierungen (z. B. Message-Bus, Functions, Middleware-Chain).
  - Kommunikation über generische JSON-Payloads; keine domänenspezifischen Felder notwendig.

## 7. Quick Reference für Implementierung
- **Health-Node**: Event-Reducer → Aggregat `{ severity, degraded_mode, render_text_only, resultsVisible }` → Kontext an Router/Composer.
- **Router**: Intent + Health → wählt Profil (`full`/`compact`/`text-only`) und erlaubt/nicht erlaubte Komponenten (keine Grids bei `critical`).
- **Response-Composer**: Baut Antwort abhängig vom Profil; enthält Fallback-Blöcke ohne Medien, bricht Wörter, setzt max-width 100%.
- **Frontend**: Health-Pings senden, bei `critical` sofort Self-Healing + Text-only-Renderer; nach Stabilisierung `RECOVERY_SIGNAL` schicken.
