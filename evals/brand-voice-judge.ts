// Layer 2 — LLM-as-judge brand voice + diversity rubric.
//
// One Claude Sonnet 4.5 call with all variants embedded. The judge sees brand
// voice rules from knowledge/brand-voice/knowledge.md plus the workspace
// anti-AI style guidance, and returns a structured rubric verdict.

import type { EvalVariant, JudgeReport } from "./lib/types";
import { JudgeReportSchema } from "./lib/types";
import { evalGenerateObjectAnthropic } from "./lib/llm";

const SYSTEM_PROMPT = [
  "You are a senior brand-voice editor evaluating counter-narrative variants for Attio (own brand, B2B CRM).",
  "Competitors: HubSpot, Salesforce, Pipedrive, Zoho, Monday.",
  "",
  "Brand voice (per knowledge/brand-voice/knowledge.md and workspace rules):",
  '- Pillar: "confident-builder" — direct, specific, opinionated, never preachy.',
  "- Prose over bullets. Concrete numbers and product details over abstractions.",
  "- Opinions over option-lists. Recommend, do not enumerate.",
  "- Human-detectable writing. The reader should not suspect an LLM wrote this.",
  "- Counter-drafts: ≤280 chars for X, ≤1300 for LinkedIn. No exaggerated claims, PII, politics, or disparagement.",
  "",
  "Forbidden words and AI-trope phrases (each instance is a clear violation):",
  '- Words: "leverage", "streamline", "empower", "delve", "robust", "seamless", "navigate", "tapestry", "beacon", "synergy", "unleash", "revolutionize", "game-changer", "cutting-edge", "best-in-class", "world-class".',
  '- Phrases: "we believe", "we focus on", "we prioritize", "settle for", "the status quo", "the truth is", "build your business", "with confidence", "make every interaction meaningful", "in a landscape where", "elevate your", "rather than settling".',
  "",
  "When you score a variant, deduct points for: forbidden words, AI tropes, generic claims without specifics (no product detail / no number / no concrete outcome), preachy or condescending tone, and structural sameness with sibling variants.",
  "Diversity is judged at the SET level — how meaningfully the variants differ in angle (data model vs ergonomics vs price vs migration vs API), not just in which competitor they name.",
].join("\n");

function buildPrompt(brand_name: string, variants: EvalVariant[]): string {
  const blocks = variants
    .map(
      (v, i) =>
        `Variant ${i} (rank ${v.rank}, score ${v.score.toFixed(2)}, mention_rate ${v.mention_rate.toFixed(2)}, avg_position ${v.avg_position ?? "null"}):\n"""\n${v.body}\n"""`,
    )
    .join("\n\n");

  return [
    `Brand under evaluation: ${brand_name}.`,
    `Total variants: ${variants.length}. Variants are ALL responses to the same competitor-move seed — they are supposed to be ranked alternatives, not duplicates.`,
    "",
    blocks,
    "",
    "Score each variant's brand_voice_fit on a 1-5 integer scale:",
    "  1 = severe brand violations or AI slop; 2 = multiple violations; 3 = mediocre; 4 = good; 5 = exemplary.",
    "List concrete violations per variant (forbidden words, AI tropes, vague claims). Empty array if none.",
    "",
    "Score the SET diversity on a 1-5 integer scale:",
    "  1 = near-duplicates; 2 = same template, swapped competitor names; 3 = different angles but similar structure; 4 = three distinct angles; 5 = three distinct angles AND distinct rhetorical structures.",
    "",
    "Identify worst_offender_idx = the variant_idx that hurts the set the most.",
    "Provide top_fix: ONE concrete instruction the engineer should apply to the simulator prompt to fix the highest-priority issue. Be specific and actionable.",
  ].join("\n");
}

export interface RunJudgeOptions {
  brand_name: string;
  variants: EvalVariant[];
  model?: "claude-sonnet-4-5" | "claude-haiku-4-5-20251001";
}

export async function runBrandVoiceJudge(
  opts: RunJudgeOptions,
): Promise<JudgeReport> {
  const model = opts.model ?? "claude-sonnet-4-5";
  const prompt = buildPrompt(opts.brand_name, opts.variants);

  const { object } = await evalGenerateObjectAnthropic({
    schema: JudgeReportSchema,
    system: SYSTEM_PROMPT,
    prompt,
    model,
    schemaName: "BrandVoiceJudgeReport",
    temperature: 0,
    maxTokens: 1500,
  });

  return object;
}
