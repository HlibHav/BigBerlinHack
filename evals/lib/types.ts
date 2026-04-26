// Eval result types — shared across diversity / judge / sensitivity layers.
import { z } from "zod";

// Reusable narrative-variant shape. We don't import @/lib/schemas/narrative-variant
// directly because that file is consumed by server-only code paths; instead we
// mirror the public fields the eval needs. NB: production schema is the SSOT
// for runtime validation — this is a strict subset for fixture parsing.
export const EvalVariantSchema = z.object({
  rank: z.number().int().min(1).max(5),
  body: z.string().min(50).max(1500),
  score: z.number().min(0).max(1),
  score_reasoning: z.string().min(20),
  predicted_sentiment: z.enum(["positive", "neutral", "negative"]),
  avg_position: z.number().min(1).nullable(),
  mention_rate: z.number().min(0).max(1),
  evidence_refs: z.array(z.string()).min(1),
});
export type EvalVariant = z.infer<typeof EvalVariantSchema>;

export const FixtureFileSchema = z.object({
  fixture_id: z.string(),
  description: z.string(),
  brand_name: z.string(),
  variants: z.array(EvalVariantSchema).min(1).max(5),
});
export type FixtureFile = z.infer<typeof FixtureFileSchema>;

export const ContrastFixtureSchema = z.object({
  fixture_id: z.literal("contrast-variants"),
  description: z.string(),
  brand_name: z.string(),
  pairs: z.object({
    identical: z.object({ a: z.string(), b: z.string() }),
    attio_vs_competitor: z.object({ a: z.string(), b: z.string() }),
    real_vs_gibberish: z.object({ a: z.string(), b: z.string() }),
  }),
});
export type ContrastFixture = z.infer<typeof ContrastFixtureSchema>;

// Layer 1 — diversity
export interface DiversityReport {
  variant_count: number;
  opening_unique_ratio: number; // unique 8-token openings / N
  trigram_jaccard_pairwise_avg: number;
  trigram_jaccard_max: number;
  forbidden_hits: Array<{ variant_idx: number; matches: string[] }>;
  ai_trope_hits: Array<{ variant_idx: number; matches: string[] }>;
  structural_pattern_count: number; // variants matching "but ... At Attio" template
  length_cv: number; // stddev / mean
  flags: string[]; // human-readable issue summary
}

// Layer 2 — LLM judge
export const JudgeReportSchema = z.object({
  diversity: z.object({
    score: z.number().int().min(1).max(5),
    reasoning: z.string().min(20),
  }),
  brand_voice_fit: z.array(
    z.object({
      variant_idx: z.number().int().min(0),
      score: z.number().int().min(1).max(5),
      violations: z.array(z.string()),
    }),
  ),
  worst_offender_idx: z.number().int().min(0),
  top_fix: z.string().min(20),
});
export type JudgeReport = z.infer<typeof JudgeReportSchema>;

// Layer 3 — scoring sensitivity
export interface ScoredVariant {
  label: string;
  body_preview: string;
  positions: Array<number | null>;
  mention_rate: number;
  avg_position: number | null;
  score: number;
}

export interface SensitivityCase {
  case_id: "identical" | "attio_vs_competitor" | "real_vs_gibberish";
  expectation: string; // human-readable expected outcome
  a: ScoredVariant;
  b: ScoredVariant;
  delta_score: number;
  delta_mention_rate: number;
  flag: "pass" | "fail" | "warn";
}

export interface SensitivityReport {
  cases: SensitivityCase[];
  hypothesis_confirmed: boolean; // judges ignore body
  total_llm_calls: number;
}

export interface FullEvalReport {
  generated_at: string;
  fixture_id: string;
  brand_name: string;
  layer_1: DiversityReport;
  layer_2: JudgeReport | { skipped: string };
  layer_3: SensitivityReport | { skipped: string };
  top_fixes: string[];
}
