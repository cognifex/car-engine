import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';

// Resolve __dirname for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from the backend folder regardless of where the server is started
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 3001;
const feedbackLog = path.join(__dirname, 'feedback.log');
const apifyModulePath = path.join(__dirname, '..', 'automatch-ai', 'dist', 'utils', 'apify.js');
let hotCache = { ts: 0, offers: [] };
const HOT_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Lazy-load the LangGraph pipeline built in automatch-ai/dist
const pipelineModulePath = path.join(__dirname, '..', 'automatch-ai', 'dist', 'workflows', 'pipeline.js');

// Middleware
app.use(cors());
app.use(express.json());

const buildPayload = (result) => {
  const reply = result?.response?.reply || '';
  const followUp = result?.response?.followUp || '';
  return {
    reply,
    followUp,
    content: result?.content || { offers: [], visuals: [], definition: '' },
  };
};

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

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

    res.json(payload);

  } catch (error) {
    console.error('Error in AutoMatch AI pipeline:', error?.response?.data || error?.message || error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to get response from AI' });
    } else {
      res.end();
    }
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
    const now = Date.now();
    if (hotCache.offers.length > 0 && now - hotCache.ts < HOT_TTL_MS) {
      return res.json({ offers: hotCache.offers.slice(0, 3) });
    }
    if (!fs.existsSync(apifyModulePath)) {
      return res.status(500).json({ error: 'AI utils not built' });
    }
    const { fetchApifyMobileListings } = await import(pathToFileURL(apifyModulePath).href);
    const offers = await fetchApifyMobileListings({
      brand: "Volkswagen",
      model: "Polo",
      maxItems: 5,
      maxPrice: 12000,
    });
    hotCache = { ts: now, offers };
    if (offers.length === 0) {
      // Try disk DB fallback
      const dbModule = await import(pathToFileURL(apifyModulePath).href);
      const db = await dbModule.readOffersDB?.().catch(() => []) || [];
      const fallback = Array.isArray(db) ? db.slice(-3).reverse() : [];
      return res.json({ offers: fallback });
    }
    res.json({ offers: offers.slice(0, 3) });
  } catch (err) {
    console.error('Error in hot offers:', err?.message || err);
    res.status(500).json({ error: 'Failed to load hot offers' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
