// Aggregated per-run audit stats. Per CONTRACTS.md §2.8.
// Discriminated union by function_name. Stored у runs.stats jsonb.
// Hackathon додано: ContentExpandRunStats (W7), MorningBriefRunStats (W6′).
import { z } from "zod";

export const RadarRunStatsSchema = z.object({
  function_name: z.literal("competitor-radar"),
  started_at: z.string().datetime(),
  duration_seconds: z.number().int().nonnegative(),
  sources_scanned: z.number().int().nonnegative(),
  signals_total: z.number().int().nonnegative(),
  signals_by_severity: z.object({
    high: z.number().int().nonnegative().default(0),
    med: z.number().int().nonnegative().default(0),
    low: z.number().int().nonnegative().default(0),
  }),
  drafts_generated: z.number().int().nonnegative(),
  cost_usd_cents: z.number().int().nonnegative(),
});
export type RadarRunStats = z.infer<typeof RadarRunStatsSchema>;

export const SimulatorRunStatsSchema = z.object({
  function_name: z.literal("narrative-simulator"),
  started_at: z.string().datetime(),
  duration_seconds: z.number().int().nonnegative(),
  variants_generated: z.number().int().min(1).max(5),
  prompts_per_variant: z.number().int(),
  models_used: z.array(z.string()),
  cost_usd_cents: z.number().int().nonnegative(),
});
export type SimulatorRunStats = z.infer<typeof SimulatorRunStatsSchema>;

export const ContentExpandRunStatsSchema = z.object({
  function_name: z.literal("content-expand"),
  started_at: z.string().datetime(),
  duration_seconds: z.number().int().nonnegative(),
  parent_counter_draft_id: z.string().uuid(),
  variants_generated: z.number().int().nonnegative(),
  cost_usd_cents: z.number().int().nonnegative(),
});
export type ContentExpandRunStats = z.infer<typeof ContentExpandRunStatsSchema>;

export const MorningBriefRunStatsSchema = z.object({
  function_name: z.literal("morning-brief"),
  started_at: z.string().datetime(),
  duration_seconds: z.number().int().nonnegative(),
  delivery_channel: z.enum(["slack", "email"]),
  delivered: z.boolean(),
  signals_summarized: z.number().int().nonnegative(),
  cost_usd_cents: z.number().int().nonnegative(),
});
export type MorningBriefRunStats = z.infer<typeof MorningBriefRunStatsSchema>;

export const RunStatsSchema = z.discriminatedUnion("function_name", [
  RadarRunStatsSchema,
  SimulatorRunStatsSchema,
  ContentExpandRunStatsSchema,
  MorningBriefRunStatsSchema,
]);
export type RunStats = z.infer<typeof RunStatsSchema>;
