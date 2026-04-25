// W6′ Slack delivery. Per CONTRACTS.md §2.10 (Slack-flavored з brand_pulse).
// brand_pulse nullable якщо no Peec data yet.
import { z } from "zod";

export const SeverityBreakdownSchema = z.object({
  high: z.number().int().nonnegative(),
  med: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
});
export type SeverityBreakdown = z.infer<typeof SeverityBreakdownSchema>;

export const SentimentMixSchema = z.object({
  positive_pct: z.number(),
  neutral_pct: z.number(),
  negative_pct: z.number(),
});
export type SentimentMix = z.infer<typeof SentimentMixSchema>;

export const BrandPulseSchema = z.object({
  visibility_pct: z.number().nullable(),
  avg_position: z.number().nullable(),
  sentiment_mix: SentimentMixSchema.nullable(),
});
export type BrandPulse = z.infer<typeof BrandPulseSchema>;

export const MorningBriefSchema = z.object({
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary_body: z.string().min(50).max(2000),
  signal_count: z.number().int().nonnegative(),
  severity_breakdown: SeverityBreakdownSchema,
  drafts_pending: z.number().int().nonnegative(),
  brand_pulse: BrandPulseSchema.nullable(),
  evidence_refs: z.array(z.string()).min(1),
});
export type MorningBrief = z.infer<typeof MorningBriefSchema>;
