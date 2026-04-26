// W11 podcast-prep output contracts. Per CONTRACTS.md §2 + brand-intel/features/podcast-prep.md.
//
// Generates a retrieval-optimized brief for a founder before a podcast appearance.
// Goal: when transcript publishes on host site / Spotify / YouTube auto-captions /
// Apple Podcasts / aggregators, AI engines crawl + cite the brand specifics.
//
// Six sub-schemas compose into PodcastBriefOutputSchema (the LLM pipeline output)
// + PodcastPrepRequestSchema (Inngest event payload) + PodcastPrepRunStatsSchema
// (runs.stats jsonb shape, registered with run-stats.ts discriminated union).
import { z } from "zod";

// ---------------------------------------------------------------------------
// Sub-schemas — one per brief section
// ---------------------------------------------------------------------------

/**
 * §4.2 Talking points — the spine of the brief. Each carries:
 * - headline: sound-bite quality, single sentence
 * - proof_point: a concrete claim (number / feature / outcome) the founder will quote
 * - suggested_phrasing: 2-3 sentences as the founder might actually say them
 * - retrievability_score: judge dimension capturing how indexable + citation-worthy
 *   this would be when transcribed
 * - maps_to_prompt: the AI-engine query this point is aimed at lifting
 */
export const TalkingPointSchema = z.object({
  headline: z.string().min(20).max(200),
  proof_point: z.string().min(20).max(400),
  suggested_phrasing: z.string().min(50).max(800),
  retrievability_score: z.number().int().min(1).max(10),
  retrievability_reasoning: z.string().min(20).max(500),
  maps_to_prompt: z.string().min(10).max(200),
});
export type TalkingPoint = z.infer<typeof TalkingPointSchema>;

/**
 * §4.3 Anticipated Q&A — likely host questions with brand-voiced suggested answers.
 * 6-10 entries. Answers ≤120 words so founder can speak them naturally.
 */
export const AnticipatedQASchema = z.object({
  question: z.string().min(15).max(300),
  suggested_answer: z.string().min(50).max(1500),
  why_host_asks: z.string().min(20).max(400),
  pitfall: z.string().min(20).max(400),
});
export type AnticipatedQA = z.infer<typeof AnticipatedQASchema>;

/**
 * §4.4 Brand-drop moments — organic spots in the conversation where a brand mention fits naturally
 * (3-5 entries). trigger = the conversational moment, suggested_mention = single
 * sentence, specificity_boost = the concrete claim that goes alongside.
 */
export const BrandDropMomentSchema = z.object({
  trigger: z.string().min(20).max(300),
  suggested_mention: z.string().min(20).max(400),
  specificity_boost: z.string().min(20).max(400),
});
export type BrandDropMoment = z.infer<typeof BrandDropMomentSchema>;

/**
 * §4.5 Topics to avoid — areas where founder has no clean response yet (recent W9
 * high-severity items, competitor outperformance gaps). Each carries pivot
 * suggestion — how to elegantly redirect if host raises it.
 */
export const TopicToAvoidSchema = z.object({
  topic: z.string().min(10).max(300),
  risk: z.string().min(20).max(400),
  pivot: z.string().min(20).max(500),
});
export type TopicToAvoid = z.infer<typeof TopicToAvoidSchema>;

/**
 * §4.6 Competitor mention strategy — per top competitor (from Peec snapshot, sorted
 * by recent W9 signal frequency). Founder defense reflex tends to name the competitor,
 * which boosts competitor visibility in the transcript — strategy gives the playbook
 * for when an explicit name is OK vs a neutral umbrella term.
 */
export const CompetitorMentionStrategySchema = z.object({
  competitor_name: z.string().min(2).max(100),
  when_ok_to_name: z.string().min(20).max(400),
  when_use_generic: z.string().min(20).max(400),
  suggested_generic_phrasing: z.array(z.string().min(3).max(80)).min(1).max(3),
  risk_if_mishandled: z.string().min(20).max(400),
});
export type CompetitorMentionStrategy = z.infer<
  typeof CompetitorMentionStrategySchema
>;

/**
 * §4.7 Judge verdict dimensions. Each 1-10. retrievability = AI-engine citation
 * likelihood; naturality = does it sound like conversation, not pitch; specificity
 * = concrete claims vs abstractions; coverage = comprehensive vs gaps.
 */
export const PodcastBriefDimensionsSchema = z.object({
  retrievability: z.number().int().min(1).max(10),
  naturality: z.number().int().min(1).max(10),
  specificity: z.number().int().min(1).max(10),
  coverage: z.number().int().min(1).max(10),
});
export type PodcastBriefDimensions = z.infer<typeof PodcastBriefDimensionsSchema>;

// ---------------------------------------------------------------------------
// Composite output — what the LLM pipeline returns and what UI renders
// ---------------------------------------------------------------------------

export const PodcastBriefOutputSchema = z.object({
  talking_points: z.array(TalkingPointSchema).min(3).max(8),
  anticipated_qa: z.array(AnticipatedQASchema).min(4).max(12),
  brand_drop_moments: z.array(BrandDropMomentSchema).min(2).max(7),
  topics_to_avoid: z.array(TopicToAvoidSchema).min(2).max(7),
  competitor_mention_strategy: z
    .array(CompetitorMentionStrategySchema)
    .min(0)
    .max(7),
  judge_score: z.number().int().min(1).max(10),
  judge_reasoning: z.string().min(30).max(2000),
  judge_dimensions: PodcastBriefDimensionsSchema,
  top_fixes: z.array(z.string().min(10).max(500)).min(0).max(5),
});
export type PodcastBriefOutput = z.infer<typeof PodcastBriefOutputSchema>;

// ---------------------------------------------------------------------------
// Inngest event payload
// ---------------------------------------------------------------------------

/**
 * Triggered by `app/actions/podcast-prep.ts` when founder submits the form.
 * Validated client-side AND in event handler (per gates.md Gate A).
 */
export const PodcastPrepRequestSchema = z.object({
  organization_id: z.string().uuid(),
  podcast_name: z.string().min(2).max(200),
  host_name: z.string().min(2).max(200),
  audience: z.string().min(10).max(500),
  episode_topic: z.string().min(10).max(500),
  // ≤3 URLs of previous host episodes for tone calibration; default empty.
  previous_episode_urls: z.array(z.string().url()).max(3).default([]),
  // ISO date (YYYY-MM-DD). Used to prioritize brief queue. Nullable.
  scheduled_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be ISO date YYYY-MM-DD")
    .nullable()
    .default(null),
  requested_by: z.string().uuid().nullable(),
});
export type PodcastPrepRequest = z.infer<typeof PodcastPrepRequestSchema>;

// ---------------------------------------------------------------------------
// runs.stats discriminator member — registered in lib/schemas/run-stats.ts
// ---------------------------------------------------------------------------

export const PodcastPrepRunStatsSchema = z.object({
  function_name: z.literal("podcast-prep"),
  started_at: z.string().datetime(),
  duration_seconds: z.number().int().nonnegative(),
  sections_generated: z.number().int().nonnegative(),
  total_llm_calls: z.number().int().nonnegative(),
  judge_score: z.number().int().min(1).max(10),
  cost_usd_cents: z.number().int().nonnegative(),
});
export type PodcastPrepRunStats = z.infer<typeof PodcastPrepRunStatsSchema>;
