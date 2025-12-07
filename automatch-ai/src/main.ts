import { runPipeline } from "./workflows/pipeline.js";
import { logger } from "./utils/logger.js";

async function demo() {
  const message = "Suche Toyota Yaris, bitte max 3 Angebote zeigen.";
  try {
    const result = await runPipeline(message);
    logger.info({ result }, "Pipeline result");

    if (result.response?.reply) {
      console.log("\n=== AutoMatch AI Antwort ===\n");
      console.log(result.response?.reply);
      if (result.response?.followUp) {
        console.log("\nFollow-up:\n" + result.response?.followUp);
      }
    }

    if (result.content?.offers?.length) {
      console.log("\n=== Angebote ===");
      for (const offer of result.content.offers) {
        console.log(`- ${offer.title} | ${offer.price} | ${offer.link}`);
      }
    }
  } catch (err) {
    logger.error({ err }, "Pipeline failed");
    process.exitCode = 1;
  }
}

demo();
