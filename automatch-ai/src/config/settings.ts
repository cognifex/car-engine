import dotenv from "dotenv";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from current working directory first
dotenv.config();

// Fallback: try backend/.env if keys are missing (common repo layout)
if (!process.env.OPENAI_API_KEY) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const backendEnv = path.resolve(__dirname, "..", "..", "..", "backend", ".env");
  dotenv.config({ path: backendEnv });
}

const settingsSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  LOG_LEVEL: z.string().default("info"),
  AUTO_DEV_TOKEN: z.string().optional(),
  APIFY_TOKEN: z.string().optional(),
});

type Settings = z.infer<typeof settingsSchema>;

export const settings: Settings = settingsSchema.parse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL || process.env.OPENAI_MODEL_NAME,
  LOG_LEVEL: process.env.LOG_LEVEL,
  AUTO_DEV_TOKEN: process.env.AUTO_DEV_TOKEN,
  APIFY_TOKEN: process.env.APIFY_TOKEN,
});

export const llmConfig = {
  model: settings.OPENAI_MODEL,
  apiKey: settings.OPENAI_API_KEY,
};
