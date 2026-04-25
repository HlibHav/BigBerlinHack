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
import {
  getLatestBrandReport,
  loadPeecSnapshot,
} from "@/lib/services/peec-snapshot";
import { tavilySearch } from "@/lib/services/tavily";
import { createServiceClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Fallback brand voice — used when org doesn't yet have brand_voice_pillars
 * persisted. Brand name + landscape data come from Peec snapshot at runtime.
 */
const FALLBACK_BRAND_VOICE = "confident-builder";

/**
 * Fallback prompts — used when Peec snapshot has fewer than 3 prompts (e.g.,
 * fresh org without tracked queries yet). These are the original 5 evergreen
 * CRM-category probes.
 */
const FALLBACK_SCORING_PROMPTS = [
  "What are the top CRM platforms for high-growth startups in 2026?",
  "Which modern CRM tools best handle relationship intelligence at scale?",
  "List the leading alternatives to Salesforce for tech companies.",
  "Which CRM platforms have the best data model for B2B SaaS teams?",
  "Recommend a CRM with strong API and customization for product teams.",
] as const;

const PHRASE_PENALTY = 0.7; // multiplier when phrase_availability.taken === true
const MAX_TAVILY_PER_W5_RUN = 5;

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

/**
 * Claim phrase extraction — pull the most distinctive 3-7 word phrase from a
 * variant body. Used as the Tavily query for phrase-availability check.
 */
const ClaimPhraseSchema = z.object({
  phrase: z
    .string()
    .min(8)
    .max(80)
    .describe("3-7 word distinctive claim phrase (no quotes, no punctuation at ends)"),
});

type PhraseAvailability = {
  taken: boolean;
  by: string[];
  evidence_urls: string[];
};

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
    // ok=false placeholder (DB has NOT NULL constraint); finalize-run UPDATE'ить
    // на true після успіху. На fail row залишається ok=false → коректна failed semantics.
    const runRow = await step.run("create-run-row", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("runs")
        .insert({
          organization_id,
          function_name: "narrative-simulator",
          event_payload: event.data as unknown as Json,
          ok: false,
          started_at: startedAt,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    });

    // -----------------------------------------------------------------------
    // 1. gather-context — Peec snapshot baseline (prompts + own brand + competitors)
    // -----------------------------------------------------------------------
    //   Reads peec-snapshot.json для:
    //   • own brand name (is_own=true) + domains (used як exclude_domains у phrase-availability)
    //   • competitor names + aliases (used для phrase availability detection)
    //   • tracked prompts[] — replace 5 hardcoded CRM probes з real landscape
    //   • baseline brand_report (visibility, position, sentiment) для lift_vs_baseline
    //   Якщо snapshot < 3 prompts — fallback на FALLBACK_SCORING_PROMPTS.
    const context = await step.run("gather-context", async () => {
      const supabase = createServiceClient();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString();

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
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(10),
        loadPeecSnapshot().catch(() => null),
      ]);

      if (signalsRes.error) throw signalsRes.error;
      if (draftsRes.error) throw draftsRes.error;

      // Resolve own brand from Peec snapshot — fallback "Attio" if snapshot missing
      const ownBrand = snapshot?.brands.find((b) => b.is_own);
      const brand_name = ownBrand?.name ?? "Attio";
      const own_domains = ownBrand?.domains ?? ["attio.com"];
      const own_aliases = ownBrand?.aliases ?? [];

      // Competitor list (with aliases) — used downstream by phrase-availability
      // detector to flag "phrase used by competitor X".
      const competitors =
        snapshot?.brands
          .filter((b) => !b.is_own)
          .map((b) => ({
            name: b.name,
            domains: b.domains,
            aliases: b.aliases,
          })) ?? [];

      // Panel prompts — Peec snapshot is the SSOT once it has ≥3 entries.
      const peecPrompts = snapshot?.prompts.map((p) => p.text) ?? [];
      const panel_prompts: readonly string[] =
        peecPrompts.length >= 3 ? peecPrompts : FALLBACK_SCORING_PROMPTS;

      // Baseline visibility / position / sentiment for own brand (latest day)
      const baselineReport = snapshot
        ? getLatestBrandReport(snapshot, brand_name)
        : null;
      const baseline = baselineReport
        ? {
            visibility: baselineReport.visibility,
            position: baselineReport.position,
            sentiment: baselineReport.sentiment as "positive" | "neutral" | "negative",
          }
        : null;

      return {
        recent_signals: signalsRes.data ?? [],
        active_drafts: draftsRes.data ?? [],
        brand_voice_pillars: [FALLBACK_BRAND_VOICE],
        brand_name,
        own_domains,
        own_aliases,
        competitors,
        panel_prompts,
        baseline,
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
    // 2.5. phrase-availability — extract distinctive claim phrase per variant
    //      і прогнати через Tavily (exclude own domains) щоб знайти clash
    //      з competitor sites. Capped MAX_TAVILY_PER_W5_RUN.
    // -----------------------------------------------------------------------
    const phraseFlags = await step.run("phrase-availability", async () => {
      const result: Map<number, PhraseAvailability> = new Map();
      const variants = generated.variants.slice(0, MAX_TAVILY_PER_W5_RUN);

      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        try {
          // Extract phrase via Claude Haiku (cheap, deterministic)
          const { object } = await generateObjectAnthropic({
            schema: ClaimPhraseSchema,
            prompt: [
              `Extract the single most distinctive 3-7 word claim phrase from the following counter-narrative.`,
              `It must be a coherent verb-noun phrase that someone might trademark or own as positioning — not generic words.`,
              ``,
              `Body:`,
              `"""${variant.body.slice(0, 800)}"""`,
              ``,
              `Return only the phrase (no quotes, no period at the end).`,
            ].join("\n"),
            model: "claude-haiku-4-5-20251001",
            organization_id,
            operation: "narrative-simulator:phrase-extract",
            schemaName: "ClaimPhrase",
            temperature: 0.1,
            run_id: runRow.id,
          });
          const phrase = object.phrase.trim();

          // Tavily search excluding our own domains
          const tavilyRes = await tavilySearch({
            query: phrase,
            exclude_domains: context.own_domains,
            max_results: 3,
            topic: "general",
            organization_id,
            run_id: runRow.id,
          });

          // Detect competitor mentions in result titles + content
          const matches: Array<{ name: string; url: string }> = [];
          for (const r of tavilyRes.results) {
            const haystack = `${r.title ?? ""} ${r.content ?? ""}`.toLowerCase();
            for (const comp of context.competitors) {
              const allNames = [comp.name, ...comp.aliases].map((n) =>
                n.toLowerCase(),
              );
              const hit = allNames.some((n) => haystack.includes(n));
              if (hit && !matches.find((m) => m.name === comp.name)) {
                matches.push({ name: comp.name, url: r.url });
              }
            }
          }

          result.set(i, {
            taken: matches.length > 0,
            by: matches.map((m) => m.name),
            evidence_urls: matches.map((m) => m.url),
          });
        } catch (err) {
          logger.info("[phrase-availability] skipped variant", {
            i,
            err: (err as Error).message,
          });
          // On failure: assume not taken (don't penalize on infra error)
          result.set(i, { taken: false, by: [], evidence_urls: [] });
        }
      }
      return Array.from(result.entries()).map(([idx, value]) => ({ idx, value }));
    });

    const phraseFlagsByIdx = new Map<number, PhraseAvailability>(
      phraseFlags.map((f) => [f.idx, f.value] as const),
    );

    // -----------------------------------------------------------------------
    // 3. score-variants — N panel prompts × 2 models per variant
    //    Now uses Peec snapshot prompts (or fallback) and dynamic brand_name.
    //    Applies phrase-availability penalty + computes lift_vs_baseline.
    // -----------------------------------------------------------------------
    type ScoredEntry = NarrativeVariant & {
      _idx: number;
      _phrase: PhraseAvailability;
      _lift: number | null;
    };

    const scored = await step.run("score-variants", async () => {
      const out: ScoredEntry[] = [];

      for (let vi = 0; vi < generated.variants.length; vi++) {
        const variant = generated.variants[vi];
        const positions: Array<number | null> = [];

        for (const prompt of context.panel_prompts) {
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
        let score = computeScore(mention_rate, avg_position);

        // Apply phrase-availability penalty
        const phrase = phraseFlagsByIdx.get(vi) ?? {
          taken: false,
          by: [],
          evidence_urls: [],
        };
        if (phrase.taken) {
          score = Math.max(0, Math.min(1, score * PHRASE_PENALTY));
        }

        // Lift vs Peec baseline visibility (positive = variant outperforms current org tracking)
        const lift =
          context.baseline !== null
            ? mention_rate - context.baseline.visibility
            : null;

        const parsed = NarrativeVariantSchema.parse({
          ...variant,
          mention_rate,
          avg_position,
          score,
        });
        out.push({ ...parsed, _idx: vi, _phrase: phrase, _lift: lift });
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
        metadata: {
          phrase_availability: v._phrase,
          lift_vs_baseline: v._lift,
          baseline: context.baseline,
        } as unknown as Json,
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
        prompts_per_variant: context.panel_prompts.length,
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
