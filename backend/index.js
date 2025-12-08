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
    debugLogs: result?.debugLogs || [],
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

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], sessionId: clientSessionId } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const sessionId = clientSessionId || `sess-${Date.now()}`;

    if (!fs.existsSync(pipelineModulePath)) {
      console.error('Pipeline build not found. Run `cd automatch-ai && npm run build`');
      return res.status(500).json({ error: 'AI pipeline not built' });
    }

    const { runPipeline } = await import(pathToFileURL(pipelineModulePath).href);
    const result = await runPipeline(message, history);
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
      "profiling",
      "intent",
      "router",
      "knowledge",
      "profileBuilder",
      "visual",
      "matching",
      "offers",
      "contentAggregator",
      "front",
    ],
    edges: [
      ["START", "profiling"],
      ["profiling", "intent"],
      ["intent", "router"],
      ["router", "knowledge"],
      ["knowledge", "profileBuilder"],
      ["profileBuilder", "visual"],
      ["visual", "matching"],
      ["matching", "offers"],
      ["offers", "contentAggregator"],
      ["contentAggregator", "front"],
      ["front", "END"],
    ],
    channels: {
      userMessage: "string",
      history: "ConversationMessage[]",
      profiling: "ProfilingOutput",
      intent: "IntentOutput",
      route: "RouteDecision",
      knowledge: "KnowledgeOutput",
      visuals: "VisualOutput",
      matches: "MatchingOutput",
      offers: "Offer[]",
      offersMeta: "Record<string, unknown>",
      content: "ContentPayload",
      profile: "PerfectProfile",
      offerSearchState: "{ failureCount?: number; lastStrategy?: string }",
      response: "FrontOutput",
      debugLogs: "AgentLogEntry[]",
    },
    note: "Static snapshot of the current LangGraph topology. Execution is sequential per graph.ts; router sets strictOffers/retryMatching on dissatisfaction/offroad. OffersMeta/offerSearchState carry observability and retry data.",
  };
  res.json(architecture);
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
