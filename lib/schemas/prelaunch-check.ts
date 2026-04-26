// W5 Pre-Launch Check schemas. Per CONTRACTS.md §2.X (post-hackathon migration).
//
// Pipeline:
//   1. load-baseline       — Peec snapshot → own brand visibility/position/sentiment
//   2. phrase-availability — 2× Tavily (general + news) → competitor clash detection
//   3. panel-scoring       — N prompts × 2 models (gpt-4o-mini + claude-haiku-4-5)
//   4. synthesize-verdict  — Claude Sonnet 4.5 → verdict + reasoning
//   5. persist             — INSERT row into prelaunch_checks
//   6. finalize            — runs row + cost roll-up
import { z } from "zod";

export const PrelaunchVerdictSchema = z.enum(["clear", "caution", "clash"]);
export type PrelaunchVerdict = z.infer<typeof PrelaunchVerdictSchema>;

export const PrelaunchBaselineSchema = z.object({
  visibility: z.number().min(0).max(1),
  position: z.number().nullable(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
});
export type PrelaunchBaseline = z.infer<typeof PrelaunchBaselineSchema>;

export const PrelaunchPhraseAvailabilitySchema = z.object({
  taken: z.boolean(),
  by: z.array(z.string()).default([]),
  evidence_urls: z.array(z.string().url()).default([]),
});
export type PrelaunchPhraseAvailability = z.infer<
  typeof PrelaunchPhraseAvailabilitySchema
>;

export const PrelaunchPanelResultSchema = z.object({
  prompt: z.string(),
  mention_rate: z.number().min(0).max(1),
  avg_position: z.number().nullable(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
});
export type PrelaunchPanelResult = z.infer<typeof PrelaunchPanelResultSchema>;

/**
 * Verdict synthesis schema — what Claude must produce in the synthesize step.
 * verdict + reasoning ≥10 chars (English, 2-3 sentences).
 */
export const PrelaunchVerdictSynthesisSchema = z.object({
  verdict: PrelaunchVerdictSchema,
  reasoning: z
    .string()
    .min(10)
    .max(800)
    .describe(
      "English 2-3 sentence rationale referencing baseline visibility, phrase availability and panel mention rate. Output MUST be English regardless of any non-English text in the analyst-facing prompt strings.",
    ),
});
export type PrelaunchVerdictSynthesis = z.infer<
  typeof PrelaunchVerdictSynthesisSchema
>;

/**
 * Full result row — what gets persisted у prelaunch_checks.
 */
export const PrelaunchCheckResultSchema = z.object({
  verdict: PrelaunchVerdictSchema,
  verdict_reasoning: z.string().min(10).max(800),
  baseline: PrelaunchBaselineSchema,
  phrase_availability: PrelaunchPhraseAvailabilitySchema,
  llm_panel_results: z.array(PrelaunchPanelResultSchema).min(1),
  cost_usd_cents: z.number().int().min(0),
  evidence_refs: z.array(z.string()).min(1),
});
export type PrelaunchCheckResult = z.infer<typeof PrelaunchCheckResultSchema>;

/**
 * Server action input — what triggerPrelaunchCheck() validates from raw user
 * form data. check_id is generated client-side so UI can subscribe to Realtime
 * на новий row by id.
 */
export const PrelaunchCheckInputSchema = z.object({
  organization_id: z.string().uuid(),
  brand_slug: z.string().min(1),
  draft_phrasing: z.string().min(10).max(2000),
  category_hint: z.string().max(200).optional(),
  requested_by: z.string().uuid().nullable().default(null),
});
export type PrelaunchCheckInput = z.infer<typeof PrelaunchCheckInputSchema>;
