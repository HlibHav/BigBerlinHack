import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import type { z } from "zod";

import { recordCost } from "@/lib/services/cost";
import { anthropicCost } from "@/lib/services/_pricing";

export type AnthropicModel = "claude-sonnet-4-5" | "claude-haiku-4-5-20251001";

export interface GenerateObjectAnthropicInput<T> {
  schema: z.Schema<T, z.ZodTypeDef, unknown>;
  prompt: string;
  model: AnthropicModel;
  organization_id: string;
  /** Operation label for the cost ledger row (e.g. "narrative-variant"). */
  operation?: string;
  run_id?: string | null;
  schemaName?: string;
  schemaDescription?: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Structured-output Claude call. Mirrors the OpenAI wrapper one-to-one so the
 * pipelines can swap providers by changing one import. Cost ledger row written
 * after every successful call.
 */
export async function generateObjectAnthropic<T>(
  input: GenerateObjectAnthropicInput<T>,
): Promise<{
  object: T;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("[anthropic] ANTHROPIC_API_KEY is not set");
  }

  const result = await generateObject({
    model: anthropic(input.model),
    schema: input.schema,
    prompt: input.prompt,
    system: input.system,
    schemaName: input.schemaName,
    schemaDescription: input.schemaDescription,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
  });

  const usd_cents = anthropicCost(
    input.model,
    result.usage.promptTokens,
    result.usage.completionTokens,
  );

  await recordCost({
    organization_id: input.organization_id,
    service: "anthropic",
    operation: input.operation ?? `generate-object:${input.model}`,
    usd_cents,
    tokens_or_units: result.usage.totalTokens,
    run_id: input.run_id ?? null,
  });

  return { object: result.object as T, usage: result.usage };
}
