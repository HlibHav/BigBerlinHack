import "server-only";

import { z } from "zod";

import { renderForbiddenListForPrompt } from "@/lib/brand/forbidden-phrases";
import { generateObjectAnthropic } from "@/lib/services/anthropic";

// ---------------------------------------------------------------------------
// Schema — judge output for ONE simulator run with N variants
// ---------------------------------------------------------------------------

export const VariantDimensionsSchema = z.object({
  specificity: z.number().int().min(1).max(10),
  brand_voice: z.number().int().min(1).max(10),
  persuasiveness: z.number().int().min(1).max(10),
  differentiation: z.number().int().min(1).max(10),
});
export type VariantDimensions = z.infer<typeof VariantDimensionsSchema>;

export const VariantVerdictSchema = z.object({
  idx: z.number().int().min(0).max(20),
  judge_score: z.number().int().min(1).max(10),
  judge_reasoning: z.string().min(30),
  dimensions: VariantDimensionsSchema,
});
export type VariantVerdict = z.infer<typeof VariantVerdictSchema>;

export const JudgeOutputSchema = z.object({
  verdicts: z.array(VariantVerdictSchema).min(1).max(10),
  set_diversity_score: z.number().int().min(1).max(10),
  set_diversity_reasoning: z.string().min(20),
});
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface JudgeVariantsInput {
  brand_name: string;
  brand_voice_pillars: string[];
  variants: Array<{ idx: number; body: string }>;
  organization_id: string;
  run_id?: string | null;
  /** Override default sonnet-4-5 if you need a cheaper / different judge. */
  model?: "claude-sonnet-4-5" | "claude-haiku-4-5-20251001";
}

/**
 * Single LLM call that rates ALL N variants of one simulator run on four
 * dimensions plus an overall judge_score (1-10) and a set-level diversity
 * score. Replaces the legacy 5-prompt × 2-model brand-recall ranking step.
 *
 * Why one call for N variants instead of N separate calls: the judge needs
 * to compare variants against each other to score `differentiation` and
 * `set_diversity`. Per-variant scoring would lose that context.
 */
export async function judgeVariants(
  input: JudgeVariantsInput,
): Promise<{ output: JudgeOutput; usage: { totalTokens: number } }> {
  if (input.variants.length === 0) {
    throw new Error("[variant-judge] no variants to judge");
  }
  const model = input.model ?? "claude-sonnet-4-5";

  const system = buildSystemPrompt(input.brand_name, input.brand_voice_pillars);
  const prompt = buildJudgePrompt(input.brand_name, input.variants);

  const { object, usage } = await generateObjectAnthropic<JudgeOutput>({
    schema: JudgeOutputSchema,
    prompt,
    system,
    model,
    organization_id: input.organization_id,
    operation: "narrative-simulator:judge",
    schemaName: "JudgeOutput",
    temperature: 0,
    maxTokens: 2000,
    run_id: input.run_id ?? null,
  });

  // Defensive sort by idx so downstream code can index by position.
  const sorted = [...object.verdicts].sort((a, b) => a.idx - b.idx);
  return {
    output: { ...object, verdicts: sorted },
    usage: { totalTokens: usage.totalTokens },
  };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  brand_name: string,
  brand_voice_pillars: string[],
): string {
  const pillars = brand_voice_pillars.length
    ? brand_voice_pillars.join(", ")
    : "confident-builder";
  return [
    `You are a senior brand-voice editor evaluating counter-narrative variants for ${brand_name}.`,
    `Brand voice pillars: ${pillars}.`,
    ``,
    `Brand voice rules (per knowledge/brand-voice/knowledge.md and workspace anti-AI guidance):`,
    `- Prose over bullets. Concrete numbers and product details over abstractions.`,
    `- Opinions over option-lists. Recommend, do not enumerate.`,
    `- Human-detectable writing. The reader should not suspect an LLM wrote this.`,
    `- Counter-drafts: ≤280 chars for X, ≤1300 for LinkedIn. No exaggerated claims, no PII, no politics, no disparagement.`,
    ``,
    renderForbiddenListForPrompt(),
    ``,
    `When you score, deduct points for: forbidden words, AI tropes, generic claims without specifics (no product detail / no number / no concrete outcome), preachy or condescending tone, and structural sameness with sibling variants.`,
  ].join("\n");
}

function buildJudgePrompt(
  brand_name: string,
  variants: Array<{ idx: number; body: string }>,
): string {
  const blocks = variants
    .map(
      (v) => `Variant idx=${v.idx}:\n"""\n${v.body}\n"""`,
    )
    .join("\n\n");

  return [
    `Brand under evaluation: ${brand_name}.`,
    `Total variants: ${variants.length}. They are alternative counter-narratives to the SAME competitor seed — they should differ in ANGLE (data model vs migration cost vs API ergonomics vs price vs daily UX vs target segment), not just in which competitor they name.`,
    ``,
    blocks,
    ``,
    `For each variant, return:`,
    `- idx (must match the input idx exactly)`,
    `- judge_score: integer 1-10 overall quality`,
    `- judge_reasoning: ≥30 chars explaining the score (cite specifics from the body)`,
    `- dimensions: four integer 1-10 sub-scores`,
    `    - specificity (concrete features / numbers / measurable outcomes; 1 = pure abstraction, 10 = multiple verifiable claims)`,
    `    - brand_voice (pillar fit, no AI tropes, no forbidden words; 1 = template AI slop, 10 = sounds like a senior PM wrote it)`,
    `    - persuasiveness (would a real prospect care; 1 = ignorable, 10 = compelling)`,
    `    - differentiation (distinct angle from sibling variants; 1 = near-duplicate, 10 = clearly different angle and structure)`,
    ``,
    `At set level, return:`,
    `- set_diversity_score: integer 1-10 — how meaningfully the variants differ in angle (NOT in competitor name).`,
    `- set_diversity_reasoning: ≥20 chars explaining.`,
  ].join("\n");
}
