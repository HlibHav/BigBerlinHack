// W11 Podcast prep. Per brand-intel/features/podcast-prep.md +
// decisions/2026-04-26-w11-podcast-prep.md.
//
// Trigger: event "podcast.prep-request" with PodcastPrepRequestSchema payload
// (organization_id, podcast_name, host_name, audience, episode_topic,
// previous_episode_urls, scheduled_date, requested_by).
//
// Step graph:
//   0. create-run-row              — placeholder runs row, ok=false
//   1. gather-context              — last 7d signals + Peec snapshot baseline + active counter-drafts + brand voice pillars
//   2. resolve-podcast-context     — optional Tavily fetch of previous episode pages (≤3) for tone/host calibration
//   3. generate-talking-points     — claude-sonnet-4-5, 5-7 angle-distinct talking points with retrievability_score
//   4. generate-anticipated-qa     — gpt-4o, 6-10 likely host questions with suggested answers (≤120 words each)
//   5. generate-brand-drop-moments — gpt-4o, 3-5 organic mention spots
//   6. generate-avoidance-list     — gpt-4o, 3-5 topics to dodge + pivot suggestions
//   7. generate-competitor-strat   — gpt-4o, per top competitor: when name/when generic/risks
//   8. judge-brief                 — claude-sonnet-4-5 single call, 4 dims + judge_score + top_fixes
//   9. assemble-brief              — render Markdown + INSERT podcast_briefs row
//  10. finalize-run                — runs row update with PodcastPrepRunStatsSchema

import { z } from "zod";

import { inngest } from "@/inngest/client";
import { renderForbiddenListForPrompt } from "@/lib/brand/forbidden-phrases";
import {
  AnticipatedQASchema,
  BrandDropMomentSchema,
  CompetitorMentionStrategySchema,
  PodcastPrepRunStatsSchema,
  TalkingPointSchema,
  TopicToAvoidSchema,
  type AnticipatedQA,
  type BrandDropMoment,
  type CompetitorMentionStrategy,
  type TalkingPoint,
  type TopicToAvoid,
} from "@/lib/schemas/podcast-brief";
import { generateObjectAnthropic } from "@/lib/services/anthropic";
import { sumRunCost } from "@/lib/services/cost";
import { generateObjectOpenAI } from "@/lib/services/openai";
import { judgePodcastBrief } from "@/lib/services/podcast-judge";
import {
  getLatestBrandReport,
  loadPeecSnapshot,
} from "@/lib/services/peec-snapshot";
import { tavilySearch } from "@/lib/services/tavily";
import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FALLBACK_BRAND_VOICE = "confident-builder";
const MAX_PREVIOUS_EPISODES = 3;
const MAX_COMPETITORS = 5;

// ---------------------------------------------------------------------------
// Inner LLM response schemas — wrap arrays in objects (AI SDK requirement)
// ---------------------------------------------------------------------------

const TalkingPointsResponseSchema = z.object({
  talking_points: z.array(TalkingPointSchema).min(3).max(8),
});
type TalkingPointsResponse = z.infer<typeof TalkingPointsResponseSchema>;

const AnticipatedQAResponseSchema = z.object({
  anticipated_qa: z.array(AnticipatedQASchema).min(4).max(12),
});
type AnticipatedQAResponse = z.infer<typeof AnticipatedQAResponseSchema>;

const BrandDropMomentsResponseSchema = z.object({
  brand_drop_moments: z.array(BrandDropMomentSchema).min(2).max(7),
});
type BrandDropMomentsResponse = z.infer<typeof BrandDropMomentsResponseSchema>;

const TopicsToAvoidResponseSchema = z.object({
  topics_to_avoid: z.array(TopicToAvoidSchema).min(2).max(7),
});
type TopicsToAvoidResponse = z.infer<typeof TopicsToAvoidResponseSchema>;

const CompetitorMentionStrategyResponseSchema = z.object({
  competitor_mention_strategy: z
    .array(CompetitorMentionStrategySchema)
    .min(0)
    .max(7),
});
type CompetitorMentionStrategyResponse = z.infer<
  typeof CompetitorMentionStrategyResponseSchema
>;

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

interface RenderArgs {
  podcast_name: string;
  host_name: string;
  audience: string;
  episode_topic: string;
  scheduled_date: string | null;
  brand_name: string;
  talking_points: TalkingPoint[];
  anticipated_qa: AnticipatedQA[];
  brand_drop_moments: BrandDropMoment[];
  topics_to_avoid: TopicToAvoid[];
  competitor_mention_strategy: CompetitorMentionStrategy[];
  judge_score: number;
  judge_reasoning: string;
  judge_dimensions: {
    retrievability: number;
    naturality: number;
    specificity: number;
    coverage: number;
  };
  top_fixes: string[];
}

export function renderMarkdown(args: RenderArgs): string {
  const dateLine = args.scheduled_date
    ? `Scheduled: **${args.scheduled_date}**\n`
    : "";

  const tpBlock = args.talking_points
    .map(
      (t, i) =>
        `### ${i + 1}. ${t.headline}\n\n` +
        `**Proof point:** ${t.proof_point}\n\n` +
        `**Suggested phrasing:** ${t.suggested_phrasing}\n\n` +
        `*Retrievability ${t.retrievability_score}/10 — ${t.retrievability_reasoning}* · *Maps to:* \`${t.maps_to_prompt}\``,
    )
    .join("\n\n---\n\n");

  const qaBlock = args.anticipated_qa
    .map(
      (q, i) =>
        `### Q${i + 1}. ${q.question}\n\n` +
        `${q.suggested_answer}\n\n` +
        `*Why host might ask:* ${q.why_host_asks}\n\n` +
        `*Pitfall:* ${q.pitfall}`,
    )
    .join("\n\n---\n\n");

  const dropsBlock = args.brand_drop_moments
    .map(
      (d, i) =>
        `${i + 1}. **Trigger:** ${d.trigger}\n   - Mention: ${d.suggested_mention}\n   - Specificity: ${d.specificity_boost}`,
    )
    .join("\n\n");

  const avoidBlock = args.topics_to_avoid
    .map(
      (a, i) =>
        `${i + 1}. **${a.topic}**\n   - Risk: ${a.risk}\n   - Pivot: ${a.pivot}`,
    )
    .join("\n\n");

  const compBlock = args.competitor_mention_strategy.length
    ? args.competitor_mention_strategy
        .map(
          (c, i) =>
            `### ${i + 1}. ${c.competitor_name}\n\n` +
            `**OK to name:** ${c.when_ok_to_name}\n\n` +
            `**Use generic instead:** ${c.when_use_generic}\n\n` +
            `**Suggested generic phrasings:** ${c.suggested_generic_phrasing.map((p) => `"${p}"`).join(", ")}\n\n` +
            `**Risk if mishandled:** ${c.risk_if_mishandled}`,
        )
        .join("\n\n---\n\n")
    : "_No top competitors flagged for this brief — Peec snapshot returned 0 competitors with recent signal frequency._";

  const dims = args.judge_dimensions;
  const fixesBlock = args.top_fixes.length
    ? args.top_fixes.map((f, i) => `${i + 1}. ${f}`).join("\n")
    : "_None — judge rated brief production-ready._";

  return [
    `# Podcast brief — ${args.podcast_name}`,
    ``,
    `Host: **${args.host_name}**  `,
    `Audience: ${args.audience}  `,
    `Topic: ${args.episode_topic}  `,
    `Brand: **${args.brand_name}**  `,
    dateLine,
    `## Judge verdict — ${args.judge_score}/10`,
    ``,
    `${args.judge_reasoning}`,
    ``,
    `| Dimension | Score |`,
    `|---|---|`,
    `| Retrievability | ${dims.retrievability}/10 |`,
    `| Naturality | ${dims.naturality}/10 |`,
    `| Specificity | ${dims.specificity}/10 |`,
    `| Coverage | ${dims.coverage}/10 |`,
    ``,
    `### Top fixes before recording`,
    ``,
    fixesBlock,
    ``,
    `---`,
    ``,
    `## Talking points`,
    ``,
    tpBlock,
    ``,
    `---`,
    ``,
    `## Anticipated Q&A`,
    ``,
    qaBlock,
    ``,
    `---`,
    ``,
    `## Brand-drop moments`,
    ``,
    dropsBlock,
    ``,
    `---`,
    ``,
    `## Topics to avoid`,
    ``,
    avoidBlock,
    ``,
    `---`,
    ``,
    `## Competitor mention strategy`,
    ``,
    compBlock,
    ``,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Inngest handler
// ---------------------------------------------------------------------------

/**
 * Inner handler — kept named so the integration test can invoke it with mocked
 * Inngest `step` interface. Production callers go through `podcastPrep`
 * registered Inngest function below.
 */
export async function __podcastPrepHandler({
  event,
  step,
  logger,
}: {
  event: { data: import("@/lib/schemas/podcast-brief").PodcastPrepRequest };
  step: {
    run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
  };
  logger: { info: (...args: unknown[]) => void };
}) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const {
    organization_id,
    podcast_name,
    host_name,
    audience,
    episode_topic,
    previous_episode_urls,
    scheduled_date,
    requested_by,
  } = event.data;

  // ---------------------------------------------------------------------
  // 0. create-run-row
  // ---------------------------------------------------------------------
  const runRow = await step.run("create-run-row", async () => {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("runs")
      .insert({
        organization_id,
        function_name: "podcast-prep",
        event_payload: event.data as unknown as Json,
        ok: false,
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data;
  });

  // ---------------------------------------------------------------------
  // 1. gather-context
  // ---------------------------------------------------------------------
  const context = await step.run("gather-context", async () => {
    const supabase = createServiceClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString();
    const fourteenDaysAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [signalsRes, draftsRes, snapshot] = await Promise.all([
      supabase
        .from("signals")
        .select("id, summary, severity, sentiment, source_url, created_at")
        .eq("organization_id", organization_id)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("counter_drafts")
        .select("id, body, channel_hint, tone_pillar, status, created_at")
        .eq("organization_id", organization_id)
        .gte("created_at", fourteenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(10),
      loadPeecSnapshot().catch(() => null),
    ]);

    if (signalsRes.error) throw signalsRes.error;
    if (draftsRes.error) throw draftsRes.error;

    const ownBrand = snapshot?.brands.find((b) => b.is_own);
    const brand_name = ownBrand?.name ?? "Attio";
    const own_domains = ownBrand?.domains ?? ["attio.com"];

    // Top competitors by recent signal mention frequency. Counts how many of
    // last-7d signals reference each competitor (substring match on summary).
    type CompetitorEntry = { name: string; signal_hits: number };
    const competitors: CompetitorEntry[] = (snapshot?.brands ?? [])
      .filter((b) => !b.is_own)
      .map((b) => {
        const needles = [b.name, ...(b.aliases ?? [])].map((n) =>
          n.toLowerCase(),
        );
        const hits = (signalsRes.data ?? []).filter((s) =>
          needles.some((n) => s.summary.toLowerCase().includes(n)),
        ).length;
        return { name: b.name, signal_hits: hits };
      })
      .sort((a, b) => b.signal_hits - a.signal_hits)
      .slice(0, MAX_COMPETITORS);

    // Recent high-severity signals without an approved counter-draft = topics
    // to avoid in the podcast.
    const approvedDraftSignalIds = new Set(
      (draftsRes.data ?? [])
        .filter((d) => d.status === "approved" || d.status === "published")
        .map(() => "" /* counter_drafts row doesn't carry signal_id in select */),
    );
    void approvedDraftSignalIds; // referenced for future filter; minimal version below
    const high_severity_unaddressed = (signalsRes.data ?? [])
      .filter((s) => s.severity === "high")
      .slice(0, 5);

    const baselineReport = snapshot
      ? getLatestBrandReport(snapshot, brand_name)
      : null;
    const baseline = baselineReport
      ? {
          visibility: baselineReport.visibility,
          position: baselineReport.position,
          sentiment: baselineReport.sentiment,
        }
      : null;

    return {
      recent_signals: signalsRes.data ?? [],
      active_drafts: draftsRes.data ?? [],
      brand_voice_pillars: [FALLBACK_BRAND_VOICE],
      brand_name,
      own_domains,
      competitors,
      high_severity_unaddressed,
      baseline,
    };
  });

  // ---------------------------------------------------------------------
  // 2. resolve-podcast-context — optional Tavily fetch (≤3 prev episode URLs)
  // ---------------------------------------------------------------------
  const podcastContext = await step.run("resolve-podcast-context", async () => {
    if (previous_episode_urls.length === 0) {
      return { previous_episode_summaries: [] as Array<{ url: string; snippet: string }> };
    }
    const sliced = previous_episode_urls.slice(0, MAX_PREVIOUS_EPISODES);
    const summaries: Array<{ url: string; snippet: string }> = [];
    for (const url of sliced) {
      try {
        // Tavily search by URL fetches page content into snippet form.
        const res = await tavilySearch({
          query: url,
          max_results: 1,
          topic: "general",
          organization_id,
          run_id: runRow.id,
        });
        const snippet = res.results[0]?.content?.slice(0, 600) ?? "";
        summaries.push({ url, snippet });
      } catch (err) {
        logger.info("[podcast-prep] previous-episode fetch skipped", {
          url,
          err: (err as Error).message,
        });
      }
    }
    return { previous_episode_summaries: summaries };
  });

  // Reusable context blocks for prompt builders below.
  const sharedContextBlock = buildSharedContextBlock({
    podcast_name,
    host_name,
    audience,
    episode_topic,
    brand_name: context.brand_name,
    brand_voice_pillars: context.brand_voice_pillars,
    recent_signals: context.recent_signals,
    baseline: context.baseline,
    previous_episode_summaries: podcastContext.previous_episode_summaries,
  });

  // ---------------------------------------------------------------------
  // 3. generate-talking-points (claude-sonnet-4-5)
  // ---------------------------------------------------------------------
  const talking_points = await step.run("generate-talking-points", async () => {
    const prompt = [
      sharedContextBlock,
      ``,
      `Generate 5-7 talking points the founder should land during this podcast.`,
      `Each talking point must:`,
      `- Have a single-sentence headline that is sound-bite quality (memorable, specific).`,
      `- Carry one concrete proof point — a number, a feature name, a measurable outcome, or a named integration. Generic value props are NOT acceptable.`,
      `- Provide suggested_phrasing of 2-3 sentences as the founder might actually speak them. Conversational, confident, not preachy.`,
      `- Be self-scored on retrievability 1-10 (how likely an AI engine will cite this when transcript publishes — distinctive specifics score high, generic abstractions score low). Add ≥20 char retrievability_reasoning.`,
      `- maps_to_prompt: the AI-engine query this point is aimed at lifting (e.g. "best CRM for B2B SaaS teams").`,
      ``,
      `Hard rules:`,
      `- DO NOT use template "competitor X claims Y, but At Attio…".`,
      `- DO NOT open with "Imagine…" or "Have you ever…".`,
      `- DO NOT name a competitor in the headline (you may reference them sparingly in proof point if relevant).`,
      ``,
      renderForbiddenListForPrompt(),
    ].join("\n");

    const { object } = await generateObjectOpenAI<TalkingPointsResponse>({
      schema: TalkingPointsResponseSchema,
      prompt,
      model: "gpt-4o",
      organization_id,
      operation: "podcast-prep:talking-points",
      schemaName: "PodcastTalkingPoints",
      temperature: 0.7,
      run_id: runRow.id,
    });
    return object.talking_points;
  });

  // ---------------------------------------------------------------------
  // 4. generate-anticipated-qa (gpt-4o)
  // ---------------------------------------------------------------------
  const anticipated_qa = await step.run("generate-anticipated-qa", async () => {
    const prompt = [
      sharedContextBlock,
      ``,
      `Generate 6-10 anticipated host questions with suggested answers.`,
      `Each entry must contain:`,
      `- question: realistic phrasing the host (${host_name}) is likely to use, calibrated to audience and episode topic.`,
      `- suggested_answer: ≤120 words, brand-voiced, specific, includes a natural brand mention with a concrete proof point. Conversational tone.`,
      `- why_host_asks: tie to a recent W9 signal, competitor move, or general industry context.`,
      `- pitfall: the common founder trap when answering this question (1 sentence).`,
      ``,
      `Use the talking points generated above as anchors so the Q&A reinforces them. Do NOT just paraphrase the talking points — questions should also probe weaknesses, edge cases, and competitive context.`,
      ``,
      `Hard rules: same forbidden list. No "Imagine…" / "Have you ever…" openings in answers.`,
      ``,
      `Talking points context:`,
      talking_points
        .map((t, i) => `  ${i + 1}. ${t.headline} — ${t.proof_point}`)
        .join("\n"),
      ``,
      renderForbiddenListForPrompt(),
    ].join("\n");

    const { object } = await generateObjectOpenAI<AnticipatedQAResponse>({
      schema: AnticipatedQAResponseSchema,
      prompt,
      model: "gpt-4o",
      organization_id,
      operation: "podcast-prep:anticipated-qa",
      schemaName: "PodcastAnticipatedQA",
      temperature: 0.7,
      run_id: runRow.id,
    });
    return object.anticipated_qa;
  });

  // ---------------------------------------------------------------------
  // 5. generate-brand-drop-moments (gpt-4o)
  // ---------------------------------------------------------------------
  const brand_drop_moments = await step.run(
    "generate-brand-drop-moments",
    async () => {
      const prompt = [
        sharedContextBlock,
        ``,
        `Generate 3-5 organic moments in the conversation where the founder can drop a brand mention naturally.`,
        `Each entry must contain:`,
        `- trigger: the conversational moment (e.g. "when host asks about your tech stack", "when discussing how you measure CS success").`,
        `- suggested_mention: ≤1 sentence the founder might say.`,
        `- specificity_boost: the concrete claim that goes alongside (number, feature name, named integration). Anchors the mention in operational reality.`,
        ``,
        `Goal: each mention should be the kind of sentence an AI engine retrieves when answering downstream prompts. Avoid spammy repetition — these should feel like the founder cares about something specific, not selling.`,
        ``,
        renderForbiddenListForPrompt(),
      ].join("\n");

      const { object } = await generateObjectOpenAI<BrandDropMomentsResponse>({
        schema: BrandDropMomentsResponseSchema,
        prompt,
        model: "gpt-4o",
        organization_id,
        operation: "podcast-prep:brand-drops",
        schemaName: "PodcastBrandDrops",
        temperature: 0.7,
        run_id: runRow.id,
      });
      return object.brand_drop_moments;
    },
  );

  // ---------------------------------------------------------------------
  // 6. generate-avoidance-list (gpt-4o)
  // ---------------------------------------------------------------------
  const topics_to_avoid = await step.run("generate-avoidance-list", async () => {
    const highSevBlock =
      context.high_severity_unaddressed.length > 0
        ? context.high_severity_unaddressed
            .map((s, i) => `  ${i + 1}. ${s.summary}`)
            .join("\n")
        : "  (none)";
    const prompt = [
      sharedContextBlock,
      ``,
      `Generate 3-5 topics the founder should AVOID raising or escalating during this podcast.`,
      `Sources for "things to avoid":`,
      `- Recent high-severity W9 signals where ${context.brand_name} has no clean response yet.`,
      `- Competitor outperformance areas where ${context.brand_name} is weaker.`,
      `- Pricing / contractual specifics that change frequently and will date the transcript.`,
      ``,
      `Each entry:`,
      `- topic: 1 sentence.`,
      `- risk: why raising this hurts (1-2 sentences). Be specific.`,
      `- pivot: how to elegantly redirect IF the host raises it (1-2 sentences). Concrete deflection language, not "decline to comment".`,
      ``,
      `Recent high-severity signals (use as input):`,
      highSevBlock,
      ``,
      renderForbiddenListForPrompt(),
    ].join("\n");

    const { object } = await generateObjectOpenAI<TopicsToAvoidResponse>({
      schema: TopicsToAvoidResponseSchema,
      prompt,
      model: "gpt-4o",
      organization_id,
      operation: "podcast-prep:avoidance",
      schemaName: "PodcastTopicsToAvoid",
      temperature: 0.7,
      run_id: runRow.id,
    });
    return object.topics_to_avoid;
  });

  // ---------------------------------------------------------------------
  // 7. generate-competitor-mention-strategy (gpt-4o)
  // ---------------------------------------------------------------------
  const competitor_mention_strategy = await step.run(
    "generate-competitor-mention-strategy",
    async () => {
      if (context.competitors.length === 0) return [];
      const compBlock = context.competitors
        .map((c, i) => `  ${i + 1}. ${c.name} (recent signal hits: ${c.signal_hits})`)
        .join("\n");
      const prompt = [
        sharedContextBlock,
        ``,
        `Top competitors detected (sorted by recent W9 signal frequency):`,
        compBlock,
        ``,
        `Generate one competitor mention strategy entry per top competitor (up to ${context.competitors.length}). Each entry:`,
        `- competitor_name: exact name from list.`,
        `- when_ok_to_name: typical situations OK to name explicitly (host asked, public comparison, well-known fact). 1-2 sentences.`,
        `- when_use_generic: situations where name boost would hurt founder's brand or sound petty. 1-2 sentences.`,
        `- suggested_generic_phrasing: array of 1-3 neutral umbrella terms (e.g. "legacy CRMs", "first-generation enterprise CRM"). Must NOT be slighting.`,
        `- risk_if_mishandled: 1 concrete risk (legal review, SEO boost to competitor in the transcript, tone problem).`,
        ``,
        `Logic: founder defense reflex tends to name the competitor, which boosts competitor visibility in the transcript exactly where we want to boost our own brand.`,
        ``,
        renderForbiddenListForPrompt(),
      ].join("\n");

      const { object } =
        await generateObjectOpenAI<CompetitorMentionStrategyResponse>({
          schema: CompetitorMentionStrategyResponseSchema,
          prompt,
          model: "gpt-4o",
          organization_id,
          operation: "podcast-prep:competitor-strategy",
          schemaName: "PodcastCompetitorStrategy",
          temperature: 0.7,
          run_id: runRow.id,
        });
      return object.competitor_mention_strategy;
    },
  );

  // ---------------------------------------------------------------------
  // 8. judge-brief — claude-sonnet-4-5 single call rates whole brief
  // ---------------------------------------------------------------------
  const judge = await step.run("judge-brief", async () => {
    const { output } = await judgePodcastBrief({
      brand_name: context.brand_name,
      brand_voice_pillars: context.brand_voice_pillars,
      podcast_name,
      host_name,
      audience,
      episode_topic,
      talking_points,
      anticipated_qa,
      brand_drop_moments,
      topics_to_avoid,
      competitor_mention_strategy,
      organization_id,
      run_id: runRow.id,
    });
    return output;
  });

  // Prevent unused-var lint for placeholder destructure inside gather-context.
  void generateObjectAnthropic;

  // ---------------------------------------------------------------------
  // 9. assemble-brief — render Markdown + INSERT podcast_briefs row
  // ---------------------------------------------------------------------
  const briefRow = await step.run("assemble-brief", async () => {
    const supabase = createServiceClient();
    const markdown_brief = renderMarkdown({
      podcast_name,
      host_name,
      audience,
      episode_topic,
      scheduled_date,
      brand_name: context.brand_name,
      talking_points,
      anticipated_qa,
      brand_drop_moments,
      topics_to_avoid,
      competitor_mention_strategy,
      judge_score: judge.judge_score,
      judge_reasoning: judge.judge_reasoning,
      judge_dimensions: judge.judge_dimensions,
      top_fixes: judge.top_fixes,
    });

    const { data, error } = await supabase
      .from("podcast_briefs")
      .insert({
        organization_id,
        podcast_name,
        host_name,
        audience,
        episode_topic,
        previous_episode_urls: previous_episode_urls as unknown as Json,
        scheduled_date,
        talking_points: talking_points as unknown as Json,
        anticipated_qa: anticipated_qa as unknown as Json,
        brand_drop_moments: brand_drop_moments as unknown as Json,
        topics_to_avoid: topics_to_avoid as unknown as Json,
        competitor_mention_strategy:
          competitor_mention_strategy as unknown as Json,
        judge_score: judge.judge_score,
        judge_reasoning: judge.judge_reasoning,
        judge_dimensions: judge.judge_dimensions as unknown as Json,
        top_fixes: judge.top_fixes as unknown as Json,
        markdown_brief,
        simulator_run_id: runRow.id,
        requested_by,
        metadata: {
          previous_episode_summaries:
            podcastContext.previous_episode_summaries,
          competitors_detected: context.competitors,
          baseline: context.baseline,
        } as unknown as Json,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id, markdown_brief };
  });

  // ---------------------------------------------------------------------
  // 10. finalize-run — runs row update + stats
  // ---------------------------------------------------------------------
  await step.run("finalize-run", async () => {
    const cost_usd_cents = await sumRunCost(runRow.id);
    const sectionsGenerated =
      [
        talking_points,
        anticipated_qa,
        brand_drop_moments,
        topics_to_avoid,
        competitor_mention_strategy,
      ].filter((s) => s.length > 0).length;
    const stats = PodcastPrepRunStatsSchema.parse({
      function_name: "podcast-prep",
      started_at: startedAt,
      duration_seconds: Math.round((Date.now() - startMs) / 1000),
      sections_generated: sectionsGenerated,
      // Talking points (1) + Q&A (1) + brand drops (1) + avoidance (1) +
      // competitor strategy (0 or 1) + judge (1) = 5 or 6.
      total_llm_calls: 5 + (competitor_mention_strategy.length > 0 ? 1 : 0),
      judge_score: judge.judge_score,
      cost_usd_cents,
    });

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("runs")
      .update({
        finished_at: new Date().toISOString(),
        stats: stats as unknown as Json,
        ok: true,
        reason: `podcast brief assembled (judge ${judge.judge_score}/10)`,
      })
      .eq("id", runRow.id);
    if (error) throw error;
    return stats;
  });

  logger.info("podcast-prep complete", {
    run_id: runRow.id,
    brief_id: briefRow.id,
    judge_score: judge.judge_score,
  });

  return {
    ok: true,
    run_id: runRow.id,
    brief_id: briefRow.id,
    judge_score: judge.judge_score,
  };
}

// ---------------------------------------------------------------------------
// Shared context block — included in each generation prompt
// ---------------------------------------------------------------------------

interface SharedContextArgs {
  podcast_name: string;
  host_name: string;
  audience: string;
  episode_topic: string;
  brand_name: string;
  brand_voice_pillars: string[];
  recent_signals: Array<{
    summary: string;
    severity: string;
    sentiment: string;
  }>;
  baseline: {
    visibility: number;
    position: number | null;
    sentiment: string;
  } | null;
  previous_episode_summaries: Array<{ url: string; snippet: string }>;
}

function buildSharedContextBlock(args: SharedContextArgs): string {
  const signalsBlock = args.recent_signals.length
    ? args.recent_signals
        .slice(0, 6)
        .map(
          (s, i) =>
            `  ${i + 1}. [${s.severity}/${s.sentiment}] ${s.summary}`,
        )
        .join("\n")
    : "  (none in last 7d)";

  const baselineBlock = args.baseline
    ? `Peec baseline visibility ${(args.baseline.visibility * 100).toFixed(0)}%, position ${args.baseline.position !== null ? args.baseline.position.toFixed(1) : "—"}, sentiment ${args.baseline.sentiment}.`
    : "No Peec baseline available.";

  const prevEpBlock = args.previous_episode_summaries.length
    ? args.previous_episode_summaries
        .map(
          (s, i) =>
            `  ${i + 1}. ${s.url}\n     snippet: ${s.snippet.slice(0, 200)}…`,
        )
        .join("\n")
    : "  (none provided)";

  return [
    `You are a senior brand-voice strategist + AI-SEO advisor preparing the founder of ${args.brand_name} for an upcoming podcast appearance.`,
    `Brand voice pillars: ${args.brand_voice_pillars.join(", ")}.`,
    ``,
    `## Podcast`,
    `- Name: "${args.podcast_name}"`,
    `- Host: ${args.host_name}`,
    `- Audience: ${args.audience}`,
    `- Episode topic: ${args.episode_topic}`,
    ``,
    `## Brand baseline`,
    baselineBlock,
    ``,
    `## Recent industry signals (last 7d, from W9 competitor radar)`,
    signalsBlock,
    ``,
    `## Previous episodes by host (calibration)`,
    prevEpBlock,
    ``,
    `## Why this matters`,
    `The transcript will publish on host site, Spotify show notes, YouTube auto-captions, Apple Podcasts, and aggregators — all crawled by AI engines (ChatGPT, Perplexity, Google AI Overviews, Microsoft Copilot). Optimize the founder's contributions for retrievability + citation by AI engines, not just for human listening pleasure.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Inngest function registration
// ---------------------------------------------------------------------------

export const podcastPrep = inngest.createFunction(
  {
    id: "podcast-prep",
    name: "W11 Podcast Prep",
  },
  { event: "podcast.prep-request" },
  async (ctx) =>
    __podcastPrepHandler({
      event: ctx.event as {
        data: import("@/lib/schemas/podcast-brief").PodcastPrepRequest;
      },
      step: ctx.step as unknown as {
        run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
      },
      logger: ctx.logger,
    }),
);
