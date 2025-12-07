import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In dist, __dirname points to dist/utils. We resolve back to src/prompts so markdown stays editable.
export const SRC_DIR = path.resolve(__dirname, "..", "..", "src");
export const PROMPTS_DIR = path.resolve(SRC_DIR, "prompts");
