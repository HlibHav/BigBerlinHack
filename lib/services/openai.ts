import "server-only";

import { openai } from "@ai-sdk/openai";
import { embed, generateObject } from "ai";
import type { z } from "zod";

import { recordCost } from "@/lib/services/cost";
import { embeddingCost, openaiCost } from "@/lib/services/_pricing";

export type OpenAIChatModel = "gpt-4o-mini" | "gpt-4o";

export interface GenerateObjectOpenAIInput<T> {
  schema: z.Schema<T, z.ZodTypeDef, unknown>;
  prompt: string;
  model: OpenAIChatModel;
  organization_id: string;
  /** Operation label for the cost ledger row (e.g. "classify-signal"). */
  operation?: string;
  run_id?: string | null;
  /** Optional helpers passed straight through to the AI SDK. */
  schemaName?: string;
  schemaDescription?: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Structured-output OpenAI call. Wraps `generateObject` from the Vercel AI SDK
 * so every LLM round-trip lands in the cost ledger automatically. Returns the
 * parsed object plus the raw usage block for callers that want to log it.
 */
export async function generateObjectOpenAI<T>(input: GenerateObjectOpenAIInput<T>): Promise<{
  object: T;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("[openai] OPENAI_API_KEY is not set");
  }

  const result = await generateObject({
    model: openai(input.model),
    schema: input.schema,
    prompt: input.prompt,
    system: input.system,
    schemaName: input.schemaName,
    schemaDescription: input.schemaDescription,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
  });

  const usd_cents = openaiCost(input.model, result.usage.promptTokens, result.usage.completionTokens);

  await recordCost({
    organization_id: input.organization_id,
    service: "openai",
    operation: input.operation ?? `generate-object:${input.model}`,
    usd_cents,
    tokens_or_units: result.usage.totalTokens,
    run_id: input.run_id ?? null,
  });

  return { object: result.object as T, usage: result.usage };
}

export interface EmbedOpenAIInput {
  text: string;
  organization_id: string;
  run_id?: string | null;
}

/**
 * `text-embedding-3-small` via the AI SDK's provider-agnostic `embed`. Returns
 * a 1536-dim vector. Cost row uses the embedding usage tokens reported by the
 * provider.
 */
export async function embedOpenAI(input: EmbedOpenAIInput): Promise<{
  embedding: number[];
  tokens: number;
}> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("[openai] OPENAI_API_KEY is not set");
  }

  const result = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: input.text,
  });

  const tokens = result.usage?.tokens ?? 0;
  const usd_cents = embeddingCost(tokens);

  await recordCost({
    organization_id: input.organization_id,
    service: "openai",
    operation: "embed:text-embedding-3-small",
    usd_cents,
    tokens_or_units: tokens,
    run_id: input.run_id ?? null,
  });

  return { embedding: result.embedding, tokens };
}
