import fs from "fs/promises";
import path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { z, ZodSchema } from "zod";
import { logger } from "../utils/logger.js";

export interface AgentOptions<TSchema extends ZodSchema> {
  name: string;
  promptPath: string;
  schema: TSchema;
  model: ChatOpenAI;
}

export abstract class AgentBase<TInput, TSchema extends ZodSchema> {
  protected readonly name: string;
  protected readonly promptPath: string;
  protected readonly schema: TSchema;
  protected readonly model: ChatOpenAI;

  constructor(options: AgentOptions<TSchema>) {
    this.name = options.name;
    this.promptPath = options.promptPath;
    this.schema = options.schema;
    this.model = options.model;
  }

  protected async loadPrompt(): Promise<string> {
    const resolved = path.resolve(this.promptPath);
    const raw = await fs.readFile(resolved, "utf8");
    return raw.trim();
  }

  protected async callLLM<TOutput>(input: TInput): Promise<TOutput> {
    const prompt = await this.loadPrompt();
    const structured = this.model.withStructuredOutput(this.schema as unknown as z.ZodTypeAny);

    logger.debug({ agent: this.name, input }, "Invoking agent");

    const result = await structured.invoke([
      { role: "system", content: prompt },
      { role: "user", content: JSON.stringify(input) },
    ]);

    logger.debug({ agent: this.name, output: result }, "Agent result");
    return result as TOutput;
  }
}
