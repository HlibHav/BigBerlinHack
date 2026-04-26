// Lightweight LLM wrappers for eval scripts.
//
// We deliberately do NOT import lib/services/{openai,anthropic}.ts because
// those are tagged "server-only" and write into the production cost ledger.
// Evals are sandbox runs — they should not pollute org-level cost rows. We
// call the AI SDK directly here. Keys come from .env.local (load via dotenv
// in the runner before invoking these functions).

import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { z } from "zod";

export type OpenAIModel = "gpt-4o-mini" | "gpt-4o";
export type AnthropicModel = "claude-sonnet-4-5" | "claude-haiku-4-5-20251001";

interface BaseInput<T> {
  schema: z.Schema<T, z.ZodTypeDef, unknown>;
  prompt: string;
  system?: string;
  schemaName?: string;
  temperature?: number;
  maxTokens?: number;
}

interface OpenAIInput<T> extends BaseInput<T> {
  model: OpenAIModel;
}

interface AnthropicInput<T> extends BaseInput<T> {
  model: AnthropicModel;
}

export async function evalGenerateObjectOpenAI<T>(
  input: OpenAIInput<T>,
): Promise<{ object: T; usage: { totalTokens: number } }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("[evals/llm] OPENAI_API_KEY is not set");
  }
  const result = await generateObject({
    model: openai(input.model),
    schema: input.schema,
    prompt: input.prompt,
    system: input.system,
    schemaName: input.schemaName,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  });
  return {
    object: result.object as T,
    usage: { totalTokens: result.usage.totalTokens },
  };
}

export async function evalGenerateObjectAnthropic<T>(
  input: AnthropicInput<T>,
): Promise<{ object: T; usage: { totalTokens: number } }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("[evals/llm] ANTHROPIC_API_KEY is not set");
  }
  const result = await generateObject({
    model: anthropic(input.model),
    schema: input.schema,
    prompt: input.prompt,
    system: input.system,
    schemaName: input.schemaName,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  });
  return {
    object: result.object as T,
    usage: { totalTokens: result.usage.totalTokens },
  };
}
