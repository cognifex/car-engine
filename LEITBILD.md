````markdown
# diefreundliche.app – Produktkonzept, Features & MVP (v1)

## 1. Produkt-Vision

**Kurzbeschreibung**

diefreundliche.app ist ein lockerer, empathischer Auto-Buddy in Chat-Form.  
User können sich entspannt über Autos unterhalten, Fragen stellen, Meinungen einholen und Automodelle entdecken – ohne mit Filtern, Kilowattzahlen oder Fachchinesisch erschlagen zu werden.

Während des Gesprächs baut die KI im Hintergrund ein **Auto-Vorlieben-Profil** auf und schlägt aus einer **bestehenden Auto-Datenbank** passende Modelle vor.  
Die Vorschläge erscheinen rechts als **Bild/Text-Karten**, können **favorisiert** und später wieder angesehen werden.

**Vision**

> „Wie ein perfekter Autoverkäufer, nur ohne Verkaufsdruck – freundlich, ehrlich, nerdig, mit Geheimtipps.“

---

## 2. Abgrenzung (Was die App NICHT ist)

**Nicht-Ziele**

- Kein Fragebogen-Wizard
- Kein klassischer Filter (Baujahr X, Preis Y, etc.)
- Kein mobile.de-Klon
- Kein „20 Fragen, dann Empfehlung“-System
- Kein trockener Datenkatalog

**Stattdessen**

- Ein **Gespräch** über Autos, Alltag, Wünsche, Sorgen
- Profiling passiert **implizit**, nicht durch „Bitte beantworte diese Liste“

---

## 3. Zielgruppe

- **18-jährige Erstkäufer:innen**
  - unsicher, wenig Auto-Wissen
  - brauchen einfache Erklärungen, Mut, Orientierung
- **40–60-jährige „Boomer“**
  - oft Vorerfahrung, teils markentreu
  - wollen Bestätigung, Geheimtipps, ehrliche Einschätzung
- **Auto-Interessierte allgemein**
  - wollen spielerisch neue Modelle entdecken
  - brauchen ehrliches, nicht-werbliches Feedback

---

## 4. UX & Tonalität

**Ton**

- Locker, freundlich, humorvoll
- Kein Fachidiotentum
- Erklärt Dinge einfach und bildhaft
- Nie von oben herab
- Lieber: „Guter Alltagsbegleiter, schluckt viel, aber hält ewig.“  
  als: „Langhubiger 4-Zylinder mit XY Nm.“

**Chat-Verhalten**

- Startet entspannt: „Erzähl mal, was du so mit deinem Auto vorhast.“
- Stellt maximal 1 Rückfrage am Stück, nie ein Frage-Interview
- Reagiert auf Emotionen („Ich hab Schiss, was Falsches zu kaufen“) empathisch
- Streut Wissen, Anekdoten, Geheimtipps ein
- Erklärt, warum ein Modell passt – nicht nur *dass* es passt

---

## 5. Kernfunktionalität (Gesamt-Feature-Set)

### 5.1 Casual Auto-Chat (Kern)

- Freier Chat zwischen User und Auto-Buddy
- Themen:
  - Alltag („Ich fahr jeden Tag 40 km zur Arbeit.“)
  - Lebenssituation („Wir haben zwei Kinder und einen Hund.“)
  - Vibes („Ich will was Sportliches, aber nicht prollig.“)
  - Sorgen („Ich will nicht an Reparaturen kaputtgehen.“)
- Der Agent:
  - beantwortet Fragen
  - gibt Erklärungen (z. B. Benzin vs. Hybrid vs. Elektro)
  - erzählt „Geheimtipps“ („Dieses Modell wirkt unscheinbar, ist aber mega robust.“)
  - merkt sich Präferenzen

### 5.2 Profiling im Hintergrund

Der Agent extrahiert aus dem Chat:

- **Budget-Vibes** (sparsam vs. bereit, mehr zu zahlen)
- **Fahrprofil** (Stadt, Land, Autobahn, Jahreskilometer)
- **Größenwunsch** (Kleinwagen, Kombi, SUV, etc.)
- **Design-Vorliebe** (sportlich, klassisch, unauffällig, cute, etc.)
- **Komfort-/Tech-Wunsch** (simple vs. viel Technik)
- **Risiko-Haltung** (konservativ vs. experimentierfreudig)
- **Markenpräferenzen** (explizit & implizit)

Daraus entsteht ein internes Profil-Objekt, z. B.:

```ts
type UserCarProfile = {
  budget_level: "low" | "medium" | "high" | "flexible";
  usage_pattern: "city" | "mixed" | "long_distance";
  size_preference: "small" | "compact" | "midsize" | "suv" | "van" | "no_preference";
  design_vibe: string[]; // ["sportlich", "unauffällig", "retro"]
  comfort_importance: "low" | "medium" | "high";
  tech_importance: "low" | "medium" | "high";
  risk_profile: "conservative" | "balanced" | "adventurous";
  explicit_brands_likes: string[];
  explicit_brands_dislikes: string[];
  deal_breakers: string[]; // "kein SUV", "kein Diesel"
};
````

### 5.3 Auto-Datenbank-Anbindung

* Nutzung einer **bereits vorhandenen Auto-Datenbank**
* Kein Scraping von mobile.de im MVP
* MatchingAgent bekommt:

  * `UserCarProfile`
  * ggf. Chat-Context (z. B. letzter User-Input)
* Rückgabe:

  * Liste von Automodellen mit:

    * Name, Marke, Baujahr-Spanne
    * Bild-URL
    * Basisdaten (Segment, Verbrauchsklasse, typische Probleme etc.)
    * „Geheimtipp“-Flag (optional)

### 5.4 Modell-Vorschläge in rechter Sidebar

UI-Idee:

* **Linke Seite**: Chat
* **Rechte Seite**: Karten mit vorgeschlagenen Modellen

Jede Karte:

* Bild
* Modellname
* Kurzbeschreibung in Umgangssprache
* 2–4 Stichpunkte:

  * Warum es zum User passt
  * Plus evtl. „Achtung, wenn …“
* **Favoriten-Icon (Herz)**

Vorschläge werden:

* dynamisch aktualisiert, wenn sich das Profil ändert
* im Frontend ausgeblendet/eingeblendet „ohne harten Schrittwechsel“

### 5.5 Favoriten & Wiederaufruf

* User kann ein Modell „herzen“
* Favoriten werden:

  * lokal im Browser (MVP) oder
  * im User-Account (später)
    gespeichert
* Extra-Ansicht: „Deine Favoriten“
* Optional MVP: sortiert nach „Wie gut passt es aktuell zu dir?“

### 5.6 Geheimtipps & Internetwissen

* Agent darf:

  * generelles Auto-Wissen aus dem Internet einbringen
  * bekannte Schwächen/Highlights von Baureihen beschreiben
  * „Nerd-Facts“ liefern (ohne zu tief zu gehen)
* Geheimtipps:

  * Modelle, die unterschätzt sind
  * Motorvarianten, die besonders robust sind
  * bekannte „Don’t Touch“-Modelle vorsichtig ansprechen („Dieses Baujahr ist etwas zickig.“)

---

## 6. MVP-Umfang

### MVP-Ziel

> Ein User kann sich mit der freundlichen App über Autos unterhalten, bekommt passend zum Gespräch Automodelle rechts angezeigt und kann diese als Favoriten speichern und später wiedersehen.

### MVP-Funktionalitäten (Must-Haves)

1. **Chat-Frontend**

   * Linke Spalte: Chatverlauf
   * Input-Feld mit „Enter = senden“
   * Evtl. vordefinierte Vorschläge („Erzähl mir von deinem Alltag“)

2. **Profiling-Agent (einfach)**

   * Extrahiert aus jeder Nachricht die wichtigsten Signale
   * Aktualisiert intern `UserCarProfile`
   * Muss nicht perfekt sein, aber grob plausibel

3. **Matching-Agent (gegen Auto-Datenbank)**

   * Nimmt `UserCarProfile`
   * Fragt Auto-Datenbank an
   * Liefert 3–6 passende Modelle zurück

4. **Model-Cards rechts**

   * Für jede Empfehlung:

     * Bild
     * Titel (Marke + Modell)
     * Kurzbeschreibung
     * 2–3 Bulletpoints „Warum das zu dir passt“
   * Automatische Aktualisierung nach neuen Chat-Infos

5. **Favorisieren**

   * Herz-Icon auf Karte
   * Favoriten in einfacher Liste abrufbar (z. B. oben rechts „⭐ Favoriten“)
   * Speicherung im Local Storage (MVP)

6. **Tonalität & Stil**

   * System-Prompt/Tuning sorgt dafür:

     * immer casual
     * nie aggressiv pushy
     * keine Angst machen, sondern Orientierung

### Nice-to-Haves im MVP

* Einfache Filter-Controls in der Sidebar (z. B. „Zeig mir nur kleine Autos“ – auf Basis des Profils)
* Shortcuts im Chat: „Zeig mir die Modelle, die du mir bisher empfohlen hast.“
* Ein „Session-Recap“: „Das habe ich über dich verstanden und deshalb magst du vermutlich diese Autos.“

---

## 7. Produkt-Backlog (Epics & Beispiel-Userstories)

### Epic 1 – Casual Auto-Chat

**User Story 1.1**
*Als Nutzer:in möchte ich mich in normaler Sprache mit der App über Autos unterhalten können, damit ich mich nicht mit Fachbegriffen herumschlagen muss.*

* Akzeptanzkriterien:

  * Antworten sind in Alltagssprache formuliert
  * Keine unverständliche Fachsprache ohne Erklärung
  * Ton ist freundlich, nicht belehrend

**User Story 1.2**
*Als Nutzer:in möchte ich ehrliche Einschätzungen bekommen (Vor- und Nachteile von Modellen), damit ich das Gefühl habe, wirklich beraten zu werden.*

---

### Epic 2 – Profiling im Hintergrund

**User Story 2.1**
*Als System möchte ich aus dem Chatverlauf ein Profil der Nutzer:innen ableiten, damit ich die Auto-Empfehlungen immer besser auf ihre Bedürfnisse abstimmen kann.*

* Akzeptanzkriterien:

  * Budgetindikatoren werden erkannt (z. B. „ich will nicht viel ausgeben“ → `budget_level = low`)
  * Fahrprofil wird aus Aussagen geschätzt
  * Deal-Breaker (z. B. „kein SUV“) werden gespeichert

---

### Epic 3 – Auto-Empfehlungen & Sidebar

**User Story 3.1**
*Als Nutzer:in möchte ich während des Chats passende Automodelle als Karten sehen, damit ich direkt konkrete Vorschläge bekomme, ohne selbst zu suchen.*

* Akzeptanzkriterien:

  * Rechts erscheinen Model-Cards mit Bild + Kurztext
  * Jede Karte erklärt kurz, warum sie passt
  * Empfehlungen werden aktualisiert, wenn sich das Profil ändert

---

### Epic 4 – Favoriten

**User Story 4.1**
*Als Nutzer:in möchte ich interessante Modelle als Favoriten markieren, damit ich sie später wiederfinde.*

* Akzeptanzkriterien:

  * Herz-Icon vorhanden
  * Bei erneutem Aufruf der Session sind Favoriten noch da (Local Storage)
  * Favoritenansicht zeigt Liste der markierten Modelle

---

### Epic 5 – Geheimtipps & Wissen

**User Story 5.1**
*Als Nutzer:in möchte ich von der App auch Geheimtipps und Hintergrundwissen bekommen, damit ich das Gefühl habe, „Insider-Wissen“ zu erhalten.*

* Akzeptanzkriterien:

  * Der Agent nennt gelegentlich alternative Modelle und „versteckte Perlen“
  * Kein Clickbait, sondern ehrliche, plausible Hinweise
  * Wissen wird verständlich erklärt

---

## 8. Agent-Architektur (konzeptionell)

### 8.1 FrontAgent (diefreundliche.app)

Verantwortung:

* Nimmt User-Eingaben
* Übergibt Text an ProfilingAgent & MatchingAgent
* Baut finale Antwort:

  * Chat-Text
  * Begleitinfos zu den vorgeschlagenen Automodellen
* Hält den Ton: locker, freundlich, nicht werbend

### 8.2 ProfilingAgent

Verantwortung:

* Aus Chat-Text Profil-Signale extrahieren
* Profil-Merge: Neues Profil = altes Profil + neue Signale
* Strukturierte JSON-Ausgabe (z. B. `UserCarProfile`)

### 8.3 MatchingAgent

Verantwortung:

* Nimmt `UserCarProfile`
* Fragt Auto-Datenbank ab (z. B. per API)
* Liefert Liste an Modellen mit Matching-Score

### 8.4 Renderer / UI-Schicht

Verantwortung:

* Modelltipps in Kartenform umsetzen
* Favoriten-Status verwalten (Herz/Unherz)
* Favoritenliste anzeigen

---

## 9. Elevator Pitch

> „Stell dir vor, du quatschst einfach locker über dein Leben und was du mit einem Auto machen willst – und im Hintergrund checkt eine freundliche KI alle relevanten Modelle, erklärt dir Vor- und Nachteile, zeigt dir passende Autos als Karten und merkt sich, was du magst. Genau das ist diefreundliche.app.“

```
```
