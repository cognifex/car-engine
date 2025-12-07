import { vi } from "vitest";
import { z } from "zod";

export type MockHandler = (messages: any[], schema: z.ZodTypeAny) => any;

export const createMockModel = (handler: MockHandler) => {
  return {
    withStructuredOutput: (schema: z.ZodTypeAny) => ({
      invoke: vi.fn(async (messages: any[]) => {
        const res = await handler(messages, schema);
        return schema.parse(res);
      }),
    }),
  } as any;
};
