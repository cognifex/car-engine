import pino from "pino";
import { settings } from "../config/settings.js";

export const logger = pino({
  name: "automatch-ai",
  level: settings.LOG_LEVEL,
  transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});
