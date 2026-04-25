// W5 Narrative Simulator. Per PIPELINES.md §W5 + CONTRACTS.md §2.5.
//
// Trigger: event "narrative.simulate-request" з payload NarrativeSimulateRequest
// (organization_id, seed_type, seed_payload, requested_by, num_variants).
//
// Step graph:
//   1. gather-context        — last 7d signals + active counter_drafts + brand voice pillars
//   2. generate-variants     — generateObjectOpenAI (gpt-4o-mini, SimulatorOutputSchema)
//   3. score-variants        — 5 hardcoded prompts × 2 models (gpt-4o-mini + claude-haiku-4-5).
//                              Compute mention_rate / avg_position / score per variant.
//   4. persist-variants      — INSERT rows у narrative_variants table.
//   5. persist-run           — runs row з SimulatorRunStatsSchema.
import { z } from "zod";

import { inngest } from "@/inngest/client";
import type { Json } from "@/lib/supabase/types";
import {
  NarrativeVariantSchema,
  SimulatorOutputSchema,
  type NarrativeVariant,
  type SimulatorOutput,
} from "@/lib/schemas/narrative-variant";
import { SimulatorRunStatsSchema } from "@/lib/schemas/run-stats";
import { generateObjectAnthropic } from "@/lib/services/anthropic";
import { sumRunCost } from "@/lib/services/cost";
import { generateObjectOpenAI } from "@/lib/services/openai";
import { createServiceClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Hackathon-static brand identity. Post-hackathon — DB lookup
 * (organizations.brand_voice_pillars / .brand_name). For Attio demo we hardcode
 * "confident-builder" tone and "Attio" mention target — the only org we ship
 * на hackathon.
 */
const HACKATHON_BRAND_NAME = "Attio";
const HACKATHON_BRAND_VOICE = "confident-builder";

/**
 * Five evergreen prompts that probe LLM brand recall in the CRM/relationship
 * data category — same set across both models so mention_rate / avg_position
 * are comparable. Refresh post-hackathon when we move to per-org prompt sets.
 */
const SCORING_PROMPTS = [
  "What are the top CRM platforms for high-growth startups in 2026?",
  "Which modern CRM tools best handle relationship intelligence at scale?",
  "List the leading alternatives to Salesforce for tech companies.",
  "Which CRM platforms have the best data model for B2B SaaS teams?",
  "Recommend a CRM with strong API and customization for product teams.",
] as const;

/**
 * Score formula per CONTRACTS.md §2.5:
 *   score = mention_rate × (1 / avg_position), clamped to [0, 1].
 *   avg_position = null  → score = 0 (brand never mentioned).
 *   avg_position < 1 is impossible (Zod min(1)), but we clamp defensively.
 */
function computeScore(mention_rate: number, avg_position: number | null): number {
  if (avg_position === null) return 0;
  const safePos = Math.max(1, avg_position);
  const raw = mention_rate * (1 / safePos);
  return Math.max(0, Math.min(1, raw));
}

// ---------------------------------------------------------------------------
// Sub-schemas for inner LLM scoring calls
// ---------------------------------------------------------------------------

/**
 * Per-prompt LLM ranking response. We ask the model to list the brands it
 * would recommend for the prompt — `brand_ranking[i]` is rank `i+1`. Empty
 * array = brand not in the consideration set.
 */
const BrandRankingSchema = z.object({
  brand_ranking: z.array(z.string()).max(15),
  reasoning: z.string().min(1),
});
type BrandRanking = z.infer<typeof BrandRankingSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Locate the 1-indexed position of the brand inside the ranked list. Match is
 * case-insensitive substring (e.g. "Attio CRM" still counts as Attio). Returns
 * null if the brand is absent.
 */
function findBrandPosition(
  ranking: string[],
  brand_name: string,
): number | null {
  const needle = brand_name.toLowerCase();
  const idx = ranking.findIndex((name) => name.toLowerCase().includes(needle));
  return idx === -1 ? null : idx + 1;
}

/**
 * Aggregate a flat array of position results (one per prompt × model run) into
 * mention_rate and avg_position. avg_position only averages the runs that
 * actually mentioned the brand; null when no run mentioned it.
 */
function aggregateScores(positions: Array<number | null>): {
  mention_rate: number;
  avg_position: number | null;
} {
  if (positions.length === 0) return { mention_rate: 0, avg_position: null };
  const mentions = positions.filter((p): p is number => p !== null);
  const mention_rate = mentions.length / positions.length;
  const avg_position =
    mentions.length === 0
      ? null
      : mentions.reduce((acc, n) => acc + n, 0) / mentions.length;
  return { mention_rate, avg_position };
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

/**
 * Inner handler kept named so the integration test can invoke it with a
 * mocked Inngest `step` interface. Production callers go through the
 * `narrativeSimulator` Inngest function below.
 */
export async function __narrativeSimulatorHandler({
  event,
  step,
  logger,
}: {
  event: { data: import("@/lib/events").NarrativeSimulateRequest };
  step: {
    run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
  };
  logger: { info: (...args: unknown[]) => void };
}) {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const {
      organization_id,
      seed_type,
      seed_payload,
      num_variants,
    } = event.data;

    // -----------------------------------------------------------------------
    // 0. create-run-row — рано щоб LLM steps могли тегувати cost_ledger з runId
    // -----------------------------------------------------------------------
    // ok=true як placeholder — finalize-run overwrites з real value.
    const runRow = await step.run("create-run-row", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("runs")
        .insert({
          organization_id,
          function_name: "narrative-simulator",
          event_payload: event.data as unknown as Json,
          ok: true,
          started_at: startedAt,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    });

    // -----------------------------------------------------------------------
    // 1. gather-context
    // -----------------------------------------------------------------------
    const context = await step.run("gather-context", async () => {
      const supabase = createServiceClient();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString();

      const [signalsRes, draftsRes] = await Promise.all([
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
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (signalsRes.error) throw signalsRes.error;
      if (draftsRes.error) throw draftsRes.error;

      // Hackathon: hardcoded brand voice pillars. Post-hackathon: read from
      // organizations.brand_voice_pillars (jsonb column to be added).
      return {
        recent_signals: signalsRes.data ?? [],
        active_drafts: draftsRes.data ?? [],
        brand_voice_pillars: [HACKATHON_BRAND_VOICE],
        brand_name: HACKATHON_BRAND_NAME,
      };
    });

    // -----------------------------------------------------------------------
    // 2. generate-variants
    // -----------------------------------------------------------------------
    const generated = await step.run("generate-variants", async () => {
      const seedSummary = JSON.stringify(seed_payload).slice(0, 1500);
      const recentSignalsBlock = context.recent_signals
        .slice(0, 5)
        .map(
          (s, i) =>
            `${i + 1}. [${s.severity}/${s.sentiment}] ${s.summary} (${s.source_url})`,
        )
        .join("\n") || "(none)";
      const activeDraftsBlock = context.active_drafts
        .slice(0, 3)
        .map((d, i) => `${i + 1}. (${d.channel_hint}) ${d.body.slice(0, 200)}`)
        .join("\n") || "(none)";

      const prompt = [
        `You are a brand-narrative strategist generating ${num_variants} ranked counter-narratives for ${context.brand_name}.`,
        `Brand voice pillars: ${context.brand_voice_pillars.join(", ")}.`,
        `Seed type: ${seed_type}. Seed payload (JSON): ${seedSummary}`,
        ``,
        `Recent signals (last 7d):`,
        recentSignalsBlock,
        ``,
        `Active counter-drafts (status=draft):`,
        activeDraftsBlock,
        ``,
        `Produce exactly ${num_variants} variants ranked 1..${num_variants} (rank 1 = your strongest pick).`,
        `Each variant must include: rank (1..${num_variants}), body (50-1500 chars, brand-voiced), score (0..1; you may set to 0.5 placeholder, scoring step will overwrite), score_reasoning (≥20 chars), predicted_sentiment (positive|neutral|negative — sentiment of the variant text itself), avg_position (set null), mention_rate (0..1; placeholder 0), evidence_refs (≥1 strings; reuse signal IDs / source URLs / seed identifiers).`,
        `Echo the seed in seed_echo (≤500 chars summary).`,
      ].join("\n");

      const { object } = await generateObjectOpenAI<SimulatorOutput>({
        schema: SimulatorOutputSchema,
        prompt,
        model: "gpt-4o-mini",
        organization_id,
        operation: "narrative-simulator:generate",
        schemaName: "SimulatorOutput",
        temperature: 0.7,
        run_id: runRow.id,
      });

      return object;
    });

    // -----------------------------------------------------------------------
    // 3. score-variants — 5 prompts × 2 models per variant
    // -----------------------------------------------------------------------
    const scored = await step.run("score-variants", async () => {
      const out: NarrativeVariant[] = [];

      for (const variant of generated.variants) {
        const positions: Array<number | null> = [];

        for (const prompt of SCORING_PROMPTS) {
          // The variant `body` becomes context the panel "knows" about — we
          // ask each panel which brands it would rank for `prompt` after
          // reading the variant. Mention/position then proxy how persuasively
          // the variant lifted the brand into the recall set.
          const ranking_prompt = [
            `Brand-positioning context (a candidate counter-narrative for ${context.brand_name}):`,
            `"""`,
            variant.body,
            `"""`,
            ``,
            `Question: ${prompt}`,
            ``,
            `List up to 10 brand names ordered by how strongly you would recommend them, most-recommended first. Provide a one-sentence reasoning.`,
          ].join("\n");

          const [openaiRes, anthropicRes] = await Promise.all([
            generateObjectOpenAI<BrandRanking>({
              schema: BrandRankingSchema,
              prompt: ranking_prompt,
              model: "gpt-4o-mini",
              organization_id,
              operation: "narrative-simulator:score-openai",
              schemaName: "BrandRanking",
              temperature: 0,
              run_id: runRow.id,
            }),
            generateObjectAnthropic<BrandRanking>({
              schema: BrandRankingSchema,
              prompt: ranking_prompt,
              model: "claude-haiku-4-5-20251001",
              organization_id,
              operation: "narrative-simulator:score-anthropic",
              schemaName: "BrandRanking",
              temperature: 0,
              run_id: runRow.id,
            }),
          ]);

          positions.push(
            findBrandPosition(openaiRes.object.brand_ranking, context.brand_name),
            findBrandPosition(anthropicRes.object.brand_ranking, context.brand_name),
          );
        }

        const { mention_rate, avg_position } = aggregateScores(positions);
        const score = computeScore(mention_rate, avg_position);

        out.push(
          NarrativeVariantSchema.parse({
            ...variant,
            mention_rate,
            avg_position,
            score,
          }),
        );
      }

      // Re-rank by computed score so rank=1 is the strongest variant after
      // empirical scoring. Stable for ties on insertion order.
      out.sort((a, b) => b.score - a.score);
      return out.map((v, i) => ({ ...v, rank: i + 1 }));
    });

    // -----------------------------------------------------------------------
    // 4. persist-variants
    // -----------------------------------------------------------------------
    const persistedCount = await step.run("persist-variants", async () => {
      const supabase = createServiceClient();
      const seed_signal_id =
        seed_type === "competitor-move" && typeof seed_payload?.signal_id === "string"
          ? (seed_payload.signal_id as string)
          : null;
      const seed_counter_draft_id =
        typeof seed_payload?.counter_draft_id === "string"
          ? (seed_payload.counter_draft_id as string)
          : null;

      const rows = scored.map((v) => ({
        organization_id,
        simulator_run_id: runRow.id,
        seed_signal_id,
        seed_counter_draft_id,
        rank: v.rank,
        body: v.body,
        score: v.score,
        score_reasoning: v.score_reasoning,
        predicted_sentiment: v.predicted_sentiment,
        avg_position: v.avg_position,
        mention_rate: v.mention_rate,
        evidence_refs: v.evidence_refs,
      }));

      const { error } = await supabase.from("narrative_variants").insert(rows);
      if (error) throw error;
      return rows.length;
    });

    // -----------------------------------------------------------------------
    // 6. finalize-run — write stats + finished_at
    // -----------------------------------------------------------------------
    await step.run("finalize-run", async () => {
      const cost_usd_cents = await sumRunCost(runRow.id);
      const stats = SimulatorRunStatsSchema.parse({
        function_name: "narrative-simulator",
        started_at: startedAt,
        duration_seconds: Math.round((Date.now() - startMs) / 1000),
        variants_generated: persistedCount,
        prompts_per_variant: SCORING_PROMPTS.length,
        models_used: ["gpt-4o-mini", "claude-haiku-4-5-20251001"],
        cost_usd_cents,
      });

      const supabase = createServiceClient();
      const { error } = await supabase
        .from("runs")
        .update({
          finished_at: new Date().toISOString(),
          stats: stats as unknown as Json,
          ok: true,
          reason: `simulated ${persistedCount} variant${persistedCount === 1 ? "" : "s"}`,
        })
        .eq("id", runRow.id);
      if (error) throw error;
      return stats;
    });

    logger.info("narrative-simulator complete", {
      run_id: runRow.id,
      variants: persistedCount,
    });

    return {
      ok: true,
      run_id: runRow.id,
      variants: persistedCount,
    };
}

export const narrativeSimulator = inngest.createFunction(
  {
    id: "narrative-simulator",
    name: "W5 Narrative Simulator",
  },
  { event: "narrative.simulate-request" },
  async (ctx) =>
    __narrativeSimulatorHandler({
      event: ctx.event as { data: import("@/lib/events").NarrativeSimulateRequest },
      step: ctx.step as unknown as { run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T> },
      logger: ctx.logger,
    }),
);
