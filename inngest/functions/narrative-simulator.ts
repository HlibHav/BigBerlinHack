// W5 Narrative Simulator. Per PIPELINES.md §W5 + CONTRACTS.md §2.5.
//
// Trigger: event "narrative.simulate-request" з payload NarrativeSimulateRequest
// (organization_id, seed_type, seed_payload, requested_by, num_variants).
//
// Step graph (post-2026-04-26 refactor — see evals/reports/ baseline):
//   0. create-run-row        — placeholder runs row so cost ledger can tag with run_id
//   1. gather-context        — last 7d signals + active counter_drafts + Peec snapshot brand context
//   2. generate-variants     — N PARALLEL gpt-4o-mini calls, one variant per sampled angle.
//                              Inlines the forbidden-phrase ban; re-rolls once if hits ≥ 2.
//   2.5. phrase-availability — per-variant Tavily clash check (penalty multiplier later).
//   3. judge-variants        — single claude-sonnet-4-5 call rates ALL variants on 4 dims.
//                              Replaces the legacy 30-call brand-recall ranking step that
//                              was confirmed body-insensitive by the baseline eval.
//   4. assemble-scored       — combine drafts + judge verdict + phrase penalty → final rows.
//   5. persist-variants      — INSERT rows у narrative_variants table (judge data in metadata jsonb).
//   6. finalize-run          — runs row з SimulatorRunStatsSchema.
import { z } from "zod";

import { inngest } from "@/inngest/client";
import type { Json } from "@/lib/supabase/types";
import {
  countForbiddenHits,
  findForbiddenHits,
  renderForbiddenListForPrompt,
} from "@/lib/brand/forbidden-phrases";
import {
  NarrativeVariantSchema,
  type NarrativeVariant,
} from "@/lib/schemas/narrative-variant";
import { SignalSentiment } from "@/lib/schemas/signal";
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
import { judgeVariants } from "@/lib/services/variant-judge";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Fallback brand voice — used when org doesn't yet have brand_voice_pillars
 * persisted. Brand name + landscape data come from Peec snapshot at runtime.
 */
const FALLBACK_BRAND_VOICE = "confident-builder";

const PHRASE_PENALTY = 0.7; // multiplier when phrase_availability.taken === true
const MAX_TAVILY_PER_W5_RUN = 5;

/**
 * Angle taxonomy used to enforce diversity across variants. The W5 simulator
 * samples `num_variants` distinct angles per run and asks for ONE variant per
 * angle in parallel — this prevents the model from emitting three rephrasings
 * of the same template (the regression captured in the 2026-04-26 baseline
 * eval, see evals/reports/).
 *
 * Each angle gets a ≤2-sentence hint plus a list of acceptable proof points
 * the variant should hint at. Add new angles freely; sampling is uniform.
 */
const ANGLES = [
  {
    key: "data_model",
    label: "Data model flexibility",
    hint: "Focus on Attio's flexible objects, custom relationships, and how teams shape the schema to their workflow without admin overhead. Hint at typed records, real-time linking, no rigid lead-account-opportunity hierarchy.",
  },
  {
    key: "migration",
    label: "Migration speed",
    hint: "Focus on how fast a team moves to Attio: days not months, parallel-run period, no data loss, no Big Bang cutover. Concrete numbers (X days, Y records, Z integrations) preferred over adjectives.",
  },
  {
    key: "api_dx",
    label: "Developer experience",
    hint: "Focus on the API and SDK ergonomics: real-time API, typed SDKs, webhook contract, no rate-limit roulette. Audience is engineers who will integrate the CRM with internal systems.",
  },
  {
    key: "pricing",
    label: "Transparent pricing",
    hint: "Focus on transparent pricing and absence of hidden tiers, per-seat surprises, or paid premium features that should be standard. NEVER disparage a competitor by name; talk about the model.",
  },
  {
    key: "speed",
    label: "Daily UX speed",
    hint: "Focus on workspace responsiveness, search latency, keyboard-first navigation, the feel of opening Attio every morning vs the alternative. Concrete UI moments, not abstractions.",
  },
  {
    key: "specialization",
    label: "B2B SaaS / RevOps fit",
    hint: "Focus on Attio being built for modern B2B SaaS / RevOps teams who outgrew generic CRM. Mention the specific shape of customer data SaaS sells (workspaces, seats, expansion) that legacy CRM doesn't model.",
  },
] as const;
type Angle = (typeof ANGLES)[number];

/** Random sample of N distinct angles. Falls back to wrap-around if N > pool. */
function sampleAngles(n: number): Angle[] {
  const pool = [...ANGLES];
  // Fisher-Yates shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  if (n <= pool.length) return pool.slice(0, n);
  // Should not happen (ANGLES.length=6, num_variants≤5) but degrade gracefully.
  const out: Angle[] = [];
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
  return out;
}

// Threshold above which we re-roll a freshly generated variant. Two hits is
// our empirical "more than incidental" cutoff from the baseline run (variants
// 0 and 2 had 5 and 3 hits respectively).
const FORBIDDEN_REROLL_THRESHOLD = 2;

/** Single-variant generation schema — used by parallel angle calls. */
const VariantDraftSchema = z.object({
  body: z
    .string()
    .min(50)
    .max(1500)
    .describe("Counter-narrative body, 3-6 sentences, brand-voiced"),
  predicted_sentiment: SignalSentiment,
  score_reasoning: z
    .string()
    .min(20)
    .describe("≥20 chars explaining why this variant is on-brand and on-angle"),
});
type VariantDraft = z.infer<typeof VariantDraftSchema>;

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
    // 1. gather-context — Peec snapshot baseline (own brand + competitors)
    // -----------------------------------------------------------------------
    //   Reads peec-snapshot.json для:
    //   • own brand name (is_own=true) + domains (used як exclude_domains у phrase-availability)
    //   • competitor names + aliases (used для phrase availability detection)
    //   • baseline brand_report (visibility, position, sentiment) для lift_vs_baseline
    //
    //   Note: tracked Peec prompts used to power the legacy ranking-prompt
    //   scoring; the judge-based scoring (step 3) does not need them, so we
    //   no longer fetch panel_prompts here.
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
        baseline,
      };
    });

    // -----------------------------------------------------------------------
    // 2. generate-variants — N parallel calls, one variant per angle
    //    Replaces the old single-batch call. Each call asks for ONE variant
    //    with an explicit angle hint ("focus on data model" / "focus on
    //    migration speed" / etc) and inlines the forbidden-phrase ban. After
    //    generation, we run countForbiddenHits on the body and re-roll once
    //    if hits >= FORBIDDEN_REROLL_THRESHOLD.
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

      const angles = sampleAngles(num_variants);
      const forbiddenBlock = renderForbiddenListForPrompt();

      const buildPrompt = (angle: Angle, retryHint: string): string =>
        [
          `You are a senior brand-narrative strategist writing ONE counter-narrative variant for ${context.brand_name}.`,
          `Brand voice pillars: ${context.brand_voice_pillars.join(", ")}.`,
          `Seed type: ${seed_type}. Seed payload (JSON): ${seedSummary}`,
          ``,
          `Recent signals (last 7d):`,
          recentSignalsBlock,
          ``,
          `Active counter-drafts (status=draft):`,
          activeDraftsBlock,
          ``,
          `ANGLE FOR THIS VARIANT: ${angle.label}`,
          angle.hint,
          ``,
          `Hard rules:`,
          `- DO NOT use the template "competitor X claims Y, but At Attio…". Open differently — with the proof point, with a number, with a concrete user moment, with a question.`,
          `- DO NOT name a competitor in the opening sentence.`,
          `- Include at least one concrete proof point: a feature name, a number, a measurable outcome, or a named integration.`,
          `- Prose, 3-6 sentences, 50-1500 chars. Conversational and confident, not preachy.`,
          ``,
          forbiddenBlock,
          ``,
          retryHint,
          ``,
          `Return: body (the variant text), predicted_sentiment (positive|neutral|negative — of the variant itself), score_reasoning (≥20 chars on why this nails the "${angle.label}" angle).`,
        ]
          .filter((line) => line !== "")
          .join("\n");

      const generateOnce = async (
        angle: Angle,
        retryHint: string,
        temperature: number,
      ): Promise<VariantDraft> => {
        const { object } = await generateObjectOpenAI<VariantDraft>({
          schema: VariantDraftSchema,
          prompt: buildPrompt(angle, retryHint),
          model: "gpt-4o-mini",
          organization_id,
          operation: "narrative-simulator:generate-angle",
          schemaName: "VariantDraft",
          temperature,
          run_id: runRow.id,
        });
        return object;
      };

      const drafts = await Promise.all(
        angles.map(async (angle) => {
          let draft = await generateOnce(angle, "", 0.85);
          let forbidden_retry_count = 0;
          let initial_hits = countForbiddenHits(draft.body);
          if (initial_hits >= FORBIDDEN_REROLL_THRESHOLD) {
            const violations = findForbiddenHits(draft.body);
            const retryHint = `Your previous attempt used these banned terms: ${[...violations.forbidden_words, ...violations.ai_tropes].join(", ")}. Rewrite without ANY of them. Use specific, concrete language instead.`;
            const retry = await generateOnce(angle, retryHint, 0.95);
            forbidden_retry_count = 1;
            // Keep retry only if it actually reduced hits.
            if (countForbiddenHits(retry.body) < initial_hits) {
              draft = retry;
            }
          }
          return {
            angle: angle.key,
            angle_label: angle.label,
            draft,
            forbidden_retry_count,
            final_forbidden_hits: countForbiddenHits(draft.body),
          };
        }),
      );

      return { drafts };
    });

    // -----------------------------------------------------------------------
    // 2.5. phrase-availability — extract distinctive claim phrase per variant
    //      і прогнати через Tavily (exclude own domains) щоб знайти clash
    //      з competitor sites. Capped MAX_TAVILY_PER_W5_RUN.
    // -----------------------------------------------------------------------
    const phraseFlags = await step.run("phrase-availability", async () => {
      const result: Map<number, PhraseAvailability> = new Map();
      const variants = generated.drafts
        .slice(0, MAX_TAVILY_PER_W5_RUN)
        .map((d) => d.draft);

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
    // 3. judge-variants — single Claude Sonnet 4.5 call rates ALL variants.
    //    Replaces the legacy 5-prompts × 2-models brand-recall ranking step
    //    that the 2026-04-26 baseline eval (evals/reports/) confirmed was
    //    body-insensitive: lorem ipsum scored 0.40 vs real Attio variant 0.45
    //    because the ranking judges retrieved Attio from brand-knowledge
    //    regardless of body. Direct rating is body-sensitive by construction
    //    and ~30× cheaper.
    //
    //    Score formula now: score = judge_score / 10 (normalized to [0,1] so
    //    UI's existing score.toFixed(2) keeps showing 0–1).
    //    mention_rate / avg_position are kept on the row for backward compat
    //    but set to 0 / null since they no longer represent anything.
    //
    //    phrase-availability penalty still applies multiplicatively.
    // -----------------------------------------------------------------------
    type ScoredEntry = NarrativeVariant & {
      _idx: number;
      _phrase: PhraseAvailability;
      _lift: number | null;
      _angle: string;
      _angle_label: string;
      _forbidden_retry: number;
      _judge_score: number;
      _judge_reasoning: string;
      _judge_dimensions: {
        specificity: number;
        brand_voice: number;
        persuasiveness: number;
        differentiation: number;
      };
    };

    const judgeRes = await step.run("judge-variants", async () => {
      const judgeInput = generated.drafts.map((d, i) => ({
        idx: i,
        body: d.draft.body,
      }));
      const { output } = await judgeVariants({
        brand_name: context.brand_name,
        brand_voice_pillars: context.brand_voice_pillars,
        variants: judgeInput,
        organization_id,
        run_id: runRow.id,
      });
      return output;
    });

    const scored = await step.run("assemble-scored", async () => {
      const out: ScoredEntry[] = [];

      for (let vi = 0; vi < generated.drafts.length; vi++) {
        const entry = generated.drafts[vi];
        const verdict = judgeRes.verdicts.find((v) => v.idx === vi);
        if (!verdict) {
          throw new Error(
            `[narrative-simulator] judge missing verdict for variant idx=${vi}`,
          );
        }

        // Phrase-availability penalty — same multiplicative logic as before.
        const phrase = phraseFlagsByIdx.get(vi) ?? {
          taken: false,
          by: [],
          evidence_urls: [],
        };
        let score = verdict.judge_score / 10;
        if (phrase.taken) {
          score = Math.max(0, Math.min(1, score * PHRASE_PENALTY));
        }

        // Lift no longer mention-rate-based. Keep as null until we have a
        // judge-vs-baseline metric (out of scope this iteration).
        const lift: number | null = null;

        // Evidence refs — derive from seed because the new generation prompt
        // doesn't ask the model to invent them (used to be a hallucination
        // surface). Always at least one entry to pass schema min(1).
        const seed_signal_id =
          seed_type === "competitor-move" &&
          typeof seed_payload?.signal_id === "string"
            ? seed_payload.signal_id
            : null;
        const seed_counter_draft_id =
          typeof seed_payload?.counter_draft_id === "string"
            ? seed_payload.counter_draft_id
            : null;
        const evidence_seed = seed_signal_id
          ? `signal:${seed_signal_id}`
          : seed_counter_draft_id
            ? `counter-draft:${seed_counter_draft_id}`
            : `seed:${seed_type}`;

        const parsed = NarrativeVariantSchema.parse({
          rank: vi + 1, // placeholder; re-ranked below
          body: entry.draft.body,
          score,
          score_reasoning: entry.draft.score_reasoning,
          predicted_sentiment: entry.draft.predicted_sentiment,
          // Legacy ranking-prompt metrics — retired. Kept on the row for
          // backward compat with UI / DB consumers. mention_rate stays a
          // valid number (schema requires non-null), avg_position is null.
          avg_position: null,
          mention_rate: 0,
          evidence_refs: [evidence_seed, `angle:${entry.angle}`],
        });

        out.push({
          ...parsed,
          _idx: vi,
          _phrase: phrase,
          _lift: lift,
          _angle: entry.angle,
          _angle_label: entry.angle_label,
          _forbidden_retry: entry.forbidden_retry_count,
          _judge_score: verdict.judge_score,
          _judge_reasoning: verdict.judge_reasoning,
          _judge_dimensions: verdict.dimensions,
        });
      }

      // Re-rank by judge_score desc. Stable for ties on insertion order.
      out.sort((a, b) => b._judge_score - a._judge_score);
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
          // New judge-based scoring fields — additive; lib/schemas stays
          // untouched so no migration. UI reads from metadata.judge_*.
          angle: v._angle,
          angle_label: v._angle_label,
          forbidden_retry_count: v._forbidden_retry,
          judge_score: v._judge_score,
          judge_reasoning: v._judge_reasoning,
          judge_dimensions: v._judge_dimensions,
          set_diversity_score: judgeRes.set_diversity_score,
          set_diversity_reasoning: judgeRes.set_diversity_reasoning,
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
      // prompts_per_variant=0 because the legacy 5-prompt panel is replaced
      // by a single judge call. SimulatorRunStatsSchema is in CRITICAL zone
      // (lib/schemas/**) so we keep its shape and just emit 0 for the field
      // that no longer applies.
      const stats = SimulatorRunStatsSchema.parse({
        function_name: "narrative-simulator",
        started_at: startedAt,
        duration_seconds: Math.round((Date.now() - startMs) / 1000),
        variants_generated: persistedCount,
        prompts_per_variant: 0,
        models_used: ["gpt-4o-mini", "claude-sonnet-4-5"],
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
