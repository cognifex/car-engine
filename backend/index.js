import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';
import fetch from 'node-fetch';

// Resolve __dirname for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from multiple likely locations
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.backend') });

const app = express();
const port = process.env.PORT || 3001;
const feedbackLog = path.join(__dirname, 'feedback.log');
const apifyModulePath = path.join(__dirname, '..', 'automatch-ai', 'dist', 'utils', 'apify.js');
const specsModulePath = path.join(__dirname, '..', 'automatch-ai', 'dist', 'utils', 'specs.js');
const sessionLogsDir = path.join(__dirname, 'session-logs');
const sessionDumpModulePath = path.join(__dirname, '..', 'automatch-ai', 'dist', 'utils', 'sessionDump.js');
const eventStore = new Map();

// Lazy-load the LangGraph pipeline built in automatch-ai/dist
const pipelineModulePath = path.join(__dirname, '..', 'automatch-ai', 'dist', 'workflows', 'pipeline.js');

// Middleware
app.use(cors());
app.use(express.json());

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const buildPayload = (result) => {
  const reply = result?.response?.reply || '';
  const followUp = result?.response?.followUp || '';
  return {
    reply,
    followUp,
    content: result?.content || { offers: [], visuals: [], definition: '' },
    content_state: result?.content_state || {
      has_results: Boolean(result?.content?.offers?.length),
      num_results: result?.content?.offers?.length || 0,
      clarification_required: false,
      no_relevant_results: !result?.content?.offers?.length,
      fallback_used: false,
      strict_matching: false,
    },
    ui_health: result?.ui_health || {},
    debugLogs: result?.debugLogs || [],
    uiRecovery: result?.uiRecovery || {},
  };
};

const appendSessionLog = (sessionId, turnId, record) => {
  try {
    ensureDir(sessionLogsDir);
    const file = path.join(sessionLogsDir, `${sessionId}.jsonl`);
    const entry = { sessionId, turnId, at: new Date().toISOString(), ...record };
    fs.appendFileSync(file, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error("Failed to write session log", err);
  }
};

app.post('/api/client-events', (req, res) => {
  try {
    const { sessionId, eventType, meta } = req.body || {};
    if (!sessionId || !eventType) return res.status(400).json({ error: 'sessionId and eventType required' });
    const event = { sessionId, type: eventType, meta: meta || {}, at: new Date().toISOString() };
    registerClientEvent(sessionId, event);
    appendSessionLog(sessionId, `client-${Date.now()}`, { eventType, meta });
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Failed to store client event', err);
    return res.status(500).json({ error: 'Failed to store client event' });
  }
});

const registerClientEvent = (sessionId, event) => {
  const existing = eventStore.get(sessionId) || [];
  const next = [...existing, event].slice(-200);
  eventStore.set(sessionId, next);
};

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], sessionId: clientSessionId } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const sessionId = clientSessionId || `sess-${Date.now()}`;
    const clientEvents = eventStore.get(sessionId) || [];

    if (!fs.existsSync(pipelineModulePath)) {
      console.error('Pipeline build not found. Run `cd automatch-ai && npm run build`');
      return res.status(500).json({ error: 'AI pipeline not built' });
    }

    const { runPipeline } = await import(pathToFileURL(pipelineModulePath).href);
    const result = await runPipeline(message, history, { sessionId, clientEvents });
    const payload = buildPayload(result);

    if (!payload.reply) {
      console.error('Empty reply from pipeline', result);
      return res.status(500).json({ error: 'No reply generated' });
    }

    const turnId = `turn-${Date.now()}`;
    appendSessionLog(sessionId, turnId, {
      user: message,
      reply: payload.reply,
      followUp: payload.followUp,
      offers: payload.content?.offers || [],
      visuals: payload.content?.visuals || [],
      definition: payload.content?.definition || '',
      history,
      debugLogs: payload.debugLogs || [],
      clientEvents,
      uiRecovery: payload.uiRecovery || {},
      content_state: payload.content_state || {},
      ui_health: payload.ui_health || {},
    });

    res.json({ ...payload, sessionId });

  } catch (error) {
    console.error('Error in AutoMatch AI pipeline:', error?.response?.data || error?.message || error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to get response from AI' });
    } else {
      res.end();
    }
  }
});

app.get('/api/session-dump/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const redacted = req.query.redacted === 'true';
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    if (!fs.existsSync(sessionDumpModulePath)) {
      console.error('Session dump module not built. Run `cd automatch-ai && npm run build`');
      return res.status(500).json({ error: 'Session dump module not built' });
    }

    const { SessionDumpStore } = await import(pathToFileURL(sessionDumpModulePath).href);
    const store = new SessionDumpStore(path.join(__dirname, '..', 'automatch-ai', 'data', 'session-dumps'));
    const dump = store.load(sessionId);
    if (!dump) return res.status(404).json({ error: 'Session not found' });

    const responsePayload = redacted
      ? {
          ...dump,
          metadata: { ...dump.metadata, redacted: true },
          conversation: dump.conversation.map((c) => ({ ...c, text: '[redacted]' })),
          turns: dump.turns.map((t) => ({
            ...t,
            userMessage: '[redacted]',
            reply: '[redacted]',
            followUp: t.followUp ? '[redacted]' : '',
          })),
        }
      : dump;

    res.json({ dump: responsePayload });
  } catch (err) {
    console.error('Failed to load session dump', err);
    res.status(500).json({ error: 'Failed to load session dump' });
  }
});

app.get('/api/session-log', (req, res) => {
  try {
    const { sessionId, limit = 50 } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const file = path.join(sessionLogsDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(file)) return res.json({ entries: [] });
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    const entries = lines.slice(-Number(limit || 50)).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    res.json({ entries });
  } catch (err) {
    console.error('Failed to read session log', err);
    res.status(500).json({ error: 'Failed to read session log' });
  }
});

app.post('/api/feedback', (req, res) => {
  try {
    const payload = {
      ...req.body,
      receivedAt: new Date().toISOString(),
      ip: req.ip,
      ua: req.headers['user-agent'],
    };
    fs.appendFileSync(feedbackLog, JSON.stringify(payload) + "\n");
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Failed to persist feedback', err);
    res.status(500).json({ error: 'Failed to store feedback' });
  }
});

app.get('/api/hot-offers', async (req, res) => {
  try {
    const specsModule = await import(pathToFileURL(specsModulePath).href);
    const specs = specsModule.loadSpecs ? specsModule.loadSpecs() : [];
    const sample = (() => {
      const arr = Array.isArray(specs) ? [...specs] : [];
      if (arr.length <= 3) return arr;
      // simple in-place shuffle
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.slice(0, 6);
    })();

    const mapped = (sample || []).map((spec) => ({
      title: `${spec.brand} ${spec.model}${spec.year ? " (" + spec.year + ")" : ""}`,
      model: `${spec.brand} ${spec.model}`,
      price: 0,
      dealer: "Modell-Info",
      link: spec.url || "",
      image_url: spec.image || "",
      location: "",
      mileage: "",
      badge: [
        spec.bodyType,
        spec.enginePowerKw ? `${spec.enginePowerKw} kW` : "",
        spec.fuel,
        spec.transmission,
      ].filter(Boolean).join(" • "),
      created_at: new Date().toISOString(),
      vin: "",
      why: spec.bodyType ? `${spec.bodyType} aus dem Katalog – zum Warmwerden.` : "Katalog-Vorschlag zum Einstieg.",
      fit_reasons: ["Preview aus der Auto-Datenbank", "Wird gleich von der Konversation überschrieben"],
      tip: ["dacia", "skoda", "kia", "hyundai", "mazda", "seat"].includes(String(spec.brand || "").toLowerCase())
        ? "Geheimtipp-Marke, oft unterschätzt."
        : "",
      caution: "",
      tags: [spec.bodyType, spec.fuel, spec.transmission].filter(Boolean),
      is_hidden_gem: ["dacia", "skoda", "kia", "hyundai", "mazda", "seat"].includes(String(spec.brand || "").toLowerCase()),
    }));
    res.json({ offers: mapped.slice(0, 3) });
  } catch (err) {
    console.error('Error in hot offers:', err?.message || err);
    res.status(500).json({ error: 'Failed to load hot offers' });
  }
});

// Static view of agent architecture for debugging/exports
app.get('/api/agent-architecture', (req, res) => {
  const sessionId = req.query.sessionId || null;
  const architecture = {
    sessionId,
    nodes: [
      "memoryBootstrap",
      "clientEvents",
      "intentParser",
      "planner",
      "execution/tooling",
      "uiHealth",
      "evaluation/guardrail",
      "response/persona",
      "memoryPersist",
    ],
    edges: [
      ["START", "memoryBootstrap"],
      ["memoryBootstrap", "clientEvents"],
      ["clientEvents", "intentParser"],
      ["intentParser", "planner"],
      ["planner", "execution/tooling"],
      ["execution/tooling", "uiHealth"],
      ["uiHealth", "evaluation/guardrail"],
      ["evaluation/guardrail", "response/persona"],
      ["response/persona", "memoryPersist"],
      ["memoryPersist", "END"],
    ],
    channels: {
      userMessage: "string",
      history: "ConversationMessage[]",
      intent: "IntentOutput",
      plan: "PlanStep[]",
      route: "RouteDecision",
      offers: "Offer[]",
      offersMeta: "Record<string, unknown>",
      content: "ContentPayload",
      content_state: "ContentState",
      uiState: "UIState",
      ui_health: "UIHealth",
      uiRecovery: "UIRecoveryInstruction",
      preferenceState: "PreferenceConstraintStateData",
      offersHistory: "OfferHistoryEntry[]",
      response: "FrontOutput",
      evaluation: "TurnEvaluation",
      memorySnapshot: "SessionMemorySnapshot",
      debugLogs: "AgentLogEntry[]",
    },
    note: "Static snapshot of the LangGraph topology: explicit planner, tooling/execution, evaluator/guardrail, persona layer, and memory persistence. Memory + UI health are first-class inputs for routing and recovery.",
  };
  res.json(architecture);
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
