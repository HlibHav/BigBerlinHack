import "server-only";

import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import type { z } from "zod";

import { recordCost } from "@/lib/services/cost";

/**
 * Google Gemini structured-output wrapper. Mirrors the OpenAI/Anthropic
 * wrappers one-to-one so pipelines can swap providers by changing one
 * import. Cost ledger row written after every successful call.
 *
 * We add Gemini to the partner-tech mix per Big Berlin Hack rules
 * (Google Deepmind is one of the eligible 3-partner-technologies).
 * Strategic split:
 *   - Sonnet 4.5 — talking points (highest brand-voice fidelity), judge
 *     (cross-section comparison)
 *   - GPT-4o — anticipated Q&A (long-form, conversational tone), brand-drop
 *     moments (specificity)
 *   - Gemini 2.5 Flash — structural sections (avoidance list, competitor
 *     mention strategy) where speed + cost matter more than nuanced phrasing
 */

export type GeminiModel =
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-pro";

export interface GenerateObjectGeminiInput<T> {
  schema: z.Schema<T, z.ZodTypeDef, unknown>;
  prompt: string;
  model: GeminiModel;
  organization_id: string;
  /** Operation label for the cost ledger row. */
  operation?: string;
  run_id?: string | null;
  schemaName?: string;
  schemaDescription?: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Pricing per 1M tokens (USD), April 2026 rates from ai.google.dev/pricing.
 * Multiply by tokens / 1_000_000 to get USD; we store cents (integer).
 */
const GEMINI_PRICING_USD_PER_1M: Record<
  GeminiModel,
  { input: number; output: number }
> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
};

function geminiCost(
  model: GeminiModel,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = GEMINI_PRICING_USD_PER_1M[model];
  const usd = (promptTokens * p.input + completionTokens * p.output) / 1_000_000;
  return Math.max(0, Math.round(usd * 100));
}

export async function generateObjectGemini<T>(
  input: GenerateObjectGeminiInput<T>,
): Promise<{
  object: T;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("[gemini] GOOGLE_GENERATIVE_AI_API_KEY is not set");
  }

  const result = await generateObject({
    model: google(input.model),
    schema: input.schema,
    prompt: input.prompt,
    system: input.system,
    schemaName: input.schemaName,
    schemaDescription: input.schemaDescription,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
  });

  const usd_cents = geminiCost(
    input.model,
    result.usage.promptTokens,
    result.usage.completionTokens,
  );

  await recordCost({
    organization_id: input.organization_id,
    service: "gemini",
    operation: input.operation ?? `generate-object:${input.model}`,
    usd_cents,
    tokens_or_units: result.usage.totalTokens,
    run_id: input.run_id ?? null,
  });

  return { object: result.object as T, usage: result.usage };
}

/**
 * Returns true iff the Gemini API key is configured. Use this to guard a
 * Gemini call site with a fallback to OpenAI/Anthropic — pipelines stay
 * green even when GOOGLE_GENERATIVE_AI_API_KEY is not set in some env.
 */
export function isGeminiAvailable(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}
