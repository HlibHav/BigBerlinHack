import "server-only";

import { renderForbiddenListForPrompt } from "@/lib/brand/forbidden-phrases";
import {
  PodcastBriefDimensionsSchema,
  type AnticipatedQA,
  type BrandDropMoment,
  type CompetitorMentionStrategy,
  type TalkingPoint,
  type TopicToAvoid,
} from "@/lib/schemas/podcast-brief";
import { generateObjectAnthropic } from "@/lib/services/anthropic";

import { z } from "zod";

// ---------------------------------------------------------------------------
// Public schema — judge output for one assembled podcast brief
// ---------------------------------------------------------------------------

export const PodcastJudgeOutputSchema = z.object({
  judge_score: z.number().int().min(1).max(10),
  judge_reasoning: z.string().min(30).max(2000),
  judge_dimensions: PodcastBriefDimensionsSchema,
  top_fixes: z.array(z.string().min(10).max(500)).min(0).max(5),
});
export type PodcastJudgeOutput = z.infer<typeof PodcastJudgeOutputSchema>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface JudgePodcastBriefInput {
  brand_name: string;
  brand_voice_pillars: string[];
  podcast_name: string;
  host_name: string;
  audience: string;
  episode_topic: string;
  talking_points: TalkingPoint[];
  anticipated_qa: AnticipatedQA[];
  brand_drop_moments: BrandDropMoment[];
  topics_to_avoid: TopicToAvoid[];
  competitor_mention_strategy: CompetitorMentionStrategy[];
  organization_id: string;
  run_id?: string | null;
  /** Override default sonnet-4-5 if you need a cheaper / different judge. */
  model?: "claude-sonnet-4-5" | "claude-haiku-4-5-20251001";
}

/**
 * Single LLM call rates a fully-assembled podcast brief on four dimensions:
 *
 * - retrievability: how likely an AI engine will cite the brand specifics
 *   from the resulting transcript when answering downstream user prompts.
 * - naturality: does the brief sound like real conversation, not a sales
 *   pitch — penalizes brand-mention overload, preachy tone, AI tropes.
 * - specificity: concrete claims (numbers, features, outcomes) vs abstract
 *   value props.
 * - coverage: comprehensive (host scenarios + competitor moments + pivot
 *   strategies) vs gaps that would leave founder unprepared.
 *
 * Returns judge_score (overall 1-10, NOT a simple average — judge weights
 * dimensions per its rubric), reasoning, and ≤5 top_fixes the founder
 * should apply before the recording.
 *
 * Mirror pattern of lib/services/variant-judge.ts so the two judges share
 * mental model and observability story.
 */
export async function judgePodcastBrief(
  input: JudgePodcastBriefInput,
): Promise<{ output: PodcastJudgeOutput; usage: { totalTokens: number } }> {
  const model = input.model ?? "claude-sonnet-4-5";

  const system = buildSystemPrompt(input.brand_name, input.brand_voice_pillars);
  const prompt = buildJudgePrompt(input);

  const { object, usage } = await generateObjectAnthropic<PodcastJudgeOutput>({
    schema: PodcastJudgeOutputSchema,
    prompt,
    system,
    model,
    organization_id: input.organization_id,
    operation: "podcast-prep:judge",
    schemaName: "PodcastJudgeOutput",
    temperature: 0,
    maxTokens: 2000,
    run_id: input.run_id ?? null,
  });

  return {
    output: object,
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
    `You are a senior brand-voice editor + AI-SEO strategist evaluating a podcast preparation brief for ${brand_name}.`,
    `Brand voice pillars: ${pillars}.`,
    ``,
    `The brief will be used by the founder of ${brand_name} during a podcast appearance. The transcript of that podcast will publish on the host site, Spotify show notes, YouTube auto-captions, Apple Podcasts, and aggregators — all crawled by AI engines (ChatGPT, Perplexity, Google AI Overviews, Microsoft Copilot). Your job is to score whether the brief, when followed, would produce a transcript that AI engines actually cite when answering user prompts about the brand's category.`,
    ``,
    `Brand voice rules (per knowledge/brand-voice/knowledge.md):`,
    `- Prose over bullets. Concrete numbers and product details over abstractions.`,
    `- Opinions over option-lists. Recommend, do not enumerate.`,
    `- Human-detectable writing. The reader / listener should not suspect an LLM wrote this.`,
    `- No exaggerated claims, no PII, no politics, no disparagement of competitors.`,
    ``,
    renderForbiddenListForPrompt(),
    ``,
    `When you score, deduct points for: forbidden words, AI tropes, generic claims without specifics (no number / no feature / no outcome), preachy or condescending tone, brand-mention overload, structural sameness across talking points.`,
  ].join("\n");
}

function buildJudgePrompt(input: JudgePodcastBriefInput): string {
  const tp = input.talking_points
    .map((t, i) => `  ${i + 1}. [${t.retrievability_score}/10] ${t.headline}\n     proof: ${t.proof_point}\n     phrasing: ${t.suggested_phrasing}`)
    .join("\n");

  const qa = input.anticipated_qa
    .map(
      (q, i) =>
        `  ${i + 1}. Q: ${q.question}\n     A: ${q.suggested_answer}\n     pitfall: ${q.pitfall}`,
    )
    .join("\n");

  const drops = input.brand_drop_moments
    .map(
      (d, i) =>
        `  ${i + 1}. trigger: ${d.trigger}\n     mention: ${d.suggested_mention}`,
    )
    .join("\n");

  const avoid = input.topics_to_avoid
    .map((a, i) => `  ${i + 1}. ${a.topic} — risk: ${a.risk} — pivot: ${a.pivot}`)
    .join("\n");

  const competitor = input.competitor_mention_strategy.length
    ? input.competitor_mention_strategy
        .map(
          (c, i) =>
            `  ${i + 1}. ${c.competitor_name} — when name: ${c.when_ok_to_name} — when generic: ${c.when_use_generic} — generic phrasings: [${c.suggested_generic_phrasing.join(", ")}]`,
        )
        .join("\n")
    : "  (none)";

  return [
    `Brand under evaluation: ${input.brand_name}.`,
    `Podcast: "${input.podcast_name}" with host ${input.host_name}.`,
    `Audience: ${input.audience}.`,
    `Episode topic: ${input.episode_topic}.`,
    ``,
    `## Talking points (${input.talking_points.length})`,
    tp,
    ``,
    `## Anticipated Q&A (${input.anticipated_qa.length})`,
    qa,
    ``,
    `## Brand-drop moments (${input.brand_drop_moments.length})`,
    drops,
    ``,
    `## Topics to avoid (${input.topics_to_avoid.length})`,
    avoid,
    ``,
    `## Competitor mention strategy (${input.competitor_mention_strategy.length})`,
    competitor,
    ``,
    `Score the WHOLE brief on:`,
    `- judge_score: integer 1-10 overall — how prepared the founder is to land a transcript that AI engines will cite. NOT a simple dimension average; weigh per the rubric below.`,
    `- judge_reasoning: ≥30 chars explaining the score (cite specifics from the brief).`,
    `- judge_dimensions: four integer 1-10 sub-scores`,
    `    - retrievability (will AI engines cite the brand specifics from the resulting transcript; 1 = transcript would be ignored, 10 = high-confidence citation across multiple engines)`,
    `    - naturality (does it sound like real conversation; 1 = pitch deck delivered verbally, 10 = founder sounds human)`,
    `    - specificity (concrete features/numbers/outcomes; 1 = pure abstraction, 10 = multiple verifiable claims)`,
    `    - coverage (anticipated host scenarios + brand-drop + competitor + avoidance all addressed; 1 = significant gaps, 10 = comprehensive)`,
    `- top_fixes: ≤5 concrete actionable instructions the founder OR the engineer should apply before recording. Be specific. Empty array only if score is 9+.`,
  ].join("\n");
}
