// W5 Pre-Launch Check Inngest pipeline.
//
// Trigger: event "prelaunch.check-request" з payload PrelaunchCheckRequest
// (organization_id, brand_slug, draft_phrasing, category_hint?, requested_by, check_id).
//
// Step graph:
//   1. load-baseline       — Peec snapshot → own brand visibility/position/sentiment + competitors + panel prompts
//   2. phrase-availability — 2× Tavily (general + news, 30d) → competitor clash detection
//   3. panel-scoring       — N prompts × 2 models (gpt-4o-mini + claude-haiku-4-5) per draft phrasing
//   4. synthesize-verdict  — Claude Sonnet 4.5 → verdict (clear|caution|clash) + reasoning
//   5. persist             — INSERT row into prelaunch_checks
//   6. finalize            — UPDATE runs row з cost roll-up
import { z } from "zod";

import { inngest } from "@/inngest/client";
import {
  PrelaunchBaselineSchema,
  PrelaunchPanelResultSchema,
  PrelaunchPhraseAvailabilitySchema,
  PrelaunchVerdictSynthesisSchema,
  type PrelaunchBaseline,
  type PrelaunchPanelResult,
  type PrelaunchPhraseAvailability,
} from "@/lib/schemas/prelaunch-check";
import { generateObjectAnthropic } from "@/lib/services/anthropic";
import { sumRunCost } from "@/lib/services/cost";
import { generateObjectOpenAI } from "@/lib/services/openai";
import {
  getLatestBrandReport,
  loadPeecSnapshot,
} from "@/lib/services/peec-snapshot";
import { tavilySearch } from "@/lib/services/tavily";
import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

const FALLBACK_PANEL_PROMPTS = [
  "What are the top CRM platforms for high-growth startups in 2026?",
  "Which modern CRM tools best handle relationship intelligence at scale?",
  "List the leading alternatives to Salesforce for tech companies.",
] as const;

const MAX_PANEL_PROMPTS = 5;
const TAVILY_GENERAL_RESULTS = 5;
const TAVILY_NEWS_RESULTS = 3;
const TAVILY_NEWS_DAYS = 30;

const BrandRankingSchema = z.object({
  brand_ranking: z.array(z.string()).max(15),
  reasoning: z.string().min(1),
});
type BrandRanking = z.infer<typeof BrandRankingSchema>;

function findBrandPosition(
  ranking: string[],
  brand_name: string,
): number | null {
  const needle = brand_name.toLowerCase();
  const idx = ranking.findIndex((name) => name.toLowerCase().includes(needle));
  return idx === -1 ? null : idx + 1;
}

function aggregatePositions(positions: Array<number | null>): {
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

export async function __prelaunchCheckHandler({
  event,
  step,
  logger,
}: {
  event: { data: import("@/lib/events").PrelaunchCheckRequest };
  step: { run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T> };
  logger: { info: (...args: unknown[]) => void };
}) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const {
    organization_id,
    brand_slug,
    draft_phrasing,
    category_hint,
    requested_by,
    check_id,
  } = event.data;

  // 0. create-run-row — рано для cost_ledger tagging
  const runRow = await step.run("create-run-row", async () => {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("runs")
      .insert({
        organization_id,
        function_name: "prelaunch-check",
        event_payload: event.data as unknown as Json,
        ok: false,
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data;
  });

  // 1. load-baseline — Peec snapshot resolves own brand + competitors + prompts
  const context = await step.run("load-baseline", async () => {
    const snapshot = await loadPeecSnapshot().catch(() => null);

    const ownBrand = snapshot?.brands.find((b) => b.is_own);
    const brand_name = ownBrand?.name ?? "Attio";
    const own_domains = ownBrand?.domains ?? ["attio.com"];
    const own_aliases = ownBrand?.aliases ?? [];

    const competitors =
      snapshot?.brands
        .filter((b) => !b.is_own)
        .map((b) => ({
          name: b.name,
          domains: b.domains,
          aliases: b.aliases,
        })) ?? [];

    const peecPrompts = snapshot?.prompts.map((p) => p.text) ?? [];
    const panel_prompts: readonly string[] = (
      peecPrompts.length >= 3 ? peecPrompts : FALLBACK_PANEL_PROMPTS
    ).slice(0, MAX_PANEL_PROMPTS);

    const baselineReport = snapshot
      ? getLatestBrandReport(snapshot, brand_name)
      : null;
    const baseline: PrelaunchBaseline = baselineReport
      ? {
          visibility: baselineReport.visibility,
          position: baselineReport.position,
          sentiment: baselineReport.sentiment as "positive" | "neutral" | "negative",
        }
      : { visibility: 0, position: null, sentiment: "neutral" };

    return {
      brand_name,
      own_domains,
      own_aliases,
      competitors,
      panel_prompts,
      baseline,
    };
  });

  // 2. phrase-availability — 2× Tavily (general + news 30d)
  const phraseAvailability: PrelaunchPhraseAvailability = await step.run(
    "phrase-availability",
    async () => {
      const evidence: Array<{ url: string; title: string | null; content: string | null }> = [];

      try {
        const general = await tavilySearch({
          query: draft_phrasing,
          exclude_domains: context.own_domains,
          max_results: TAVILY_GENERAL_RESULTS,
          topic: "general",
          organization_id,
          run_id: runRow.id,
        });
        evidence.push(
          ...general.results.map((r) => ({
            url: r.url,
            title: r.title ?? null,
            content: r.content ?? null,
          })),
        );
      } catch (err) {
        logger.info("[prelaunch] general tavily skipped", {
          err: (err as Error).message,
        });
      }

      try {
        const news = await tavilySearch({
          query: draft_phrasing,
          exclude_domains: context.own_domains,
          max_results: TAVILY_NEWS_RESULTS,
          topic: "news",
          days: TAVILY_NEWS_DAYS,
          organization_id,
          run_id: runRow.id,
        });
        evidence.push(
          ...news.results.map((r) => ({
            url: r.url,
            title: r.title ?? null,
            content: r.content ?? null,
          })),
        );
      } catch (err) {
        logger.info("[prelaunch] news tavily skipped", {
          err: (err as Error).message,
        });
      }

      // Detect competitor mentions у evidence
      const matches: Array<{ name: string; url: string }> = [];
      for (const e of evidence) {
        const haystack = `${e.title ?? ""} ${e.content ?? ""}`.toLowerCase();
        for (const comp of context.competitors) {
          const allNames = [comp.name, ...comp.aliases].map((n) =>
            n.toLowerCase(),
          );
          const hit = allNames.some((n) => haystack.includes(n));
          if (hit && !matches.find((m) => m.name === comp.name)) {
            matches.push({ name: comp.name, url: e.url });
          }
        }
      }

      const result = PrelaunchPhraseAvailabilitySchema.parse({
        taken: matches.length > 0,
        by: matches.map((m) => m.name),
        evidence_urls: matches.map((m) => m.url),
      });
      return result;
    },
  );

  // 3. panel-scoring — N prompts × 2 models per the draft phrasing
  const panelResults: PrelaunchPanelResult[] = await step.run(
    "panel-scoring",
    async () => {
      const out: PrelaunchPanelResult[] = [];
      for (const prompt of context.panel_prompts) {
        const ranking_prompt = [
          `Brand-positioning context (a candidate launch claim for ${context.brand_name}):`,
          `"""`,
          draft_phrasing,
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
            operation: "prelaunch:score-openai",
            schemaName: "BrandRanking",
            temperature: 0,
            run_id: runRow.id,
          }),
          generateObjectAnthropic<BrandRanking>({
            schema: BrandRankingSchema,
            prompt: ranking_prompt,
            model: "claude-haiku-4-5-20251001",
            organization_id,
            operation: "prelaunch:score-anthropic",
            schemaName: "BrandRanking",
            temperature: 0,
            run_id: runRow.id,
          }),
        ]);

        const positions = [
          findBrandPosition(openaiRes.object.brand_ranking, context.brand_name),
          findBrandPosition(anthropicRes.object.brand_ranking, context.brand_name),
        ];
        const { mention_rate, avg_position } = aggregatePositions(positions);

        // sentiment of the draft phrasing per the prompt context — we infer
        // from positions: if mentioned at top → positive; mid → neutral; absent → negative.
        const sentiment: PrelaunchPanelResult["sentiment"] =
          avg_position !== null && avg_position <= 3
            ? "positive"
            : avg_position !== null
              ? "neutral"
              : "negative";

        out.push(
          PrelaunchPanelResultSchema.parse({
            prompt,
            mention_rate,
            avg_position,
            sentiment,
          }),
        );
      }
      return out;
    },
  );

  // 4. synthesize-verdict — Claude Sonnet 4.5 reasoning
  const synthesis = await step.run("synthesize-verdict", async () => {
    const meanMention =
      panelResults.length === 0
        ? 0
        : panelResults.reduce((acc, p) => acc + p.mention_rate, 0) /
          panelResults.length;

    const synthesisPrompt = [
      `Ти аналітик BBH (Brand Intelligence). Винеси verdict для pre-launch перевірки фрази.`,
      ``,
      `Бренд: ${context.brand_name}`,
      `Категорія: ${category_hint ?? "(не задано)"}`,
      ``,
      `Запропонована фраза:`,
      `"""${draft_phrasing}"""`,
      ``,
      `Peec baseline (поточний стан):`,
      `- visibility: ${(context.baseline.visibility * 100).toFixed(1)}%`,
      `- position: ${context.baseline.position ?? "n/a"}`,
      `- sentiment: ${context.baseline.sentiment}`,
      ``,
      `Phrase availability (Tavily):`,
      `- taken: ${phraseAvailability.taken}`,
      phraseAvailability.taken
        ? `- by: ${phraseAvailability.by.join(", ")}`
        : `- (no competitor clash)`,
      ``,
      `Panel scoring (${panelResults.length} prompts × 2 моделі):`,
      `- mean mention rate after reading фрази: ${(meanMention * 100).toFixed(1)}%`,
      ...panelResults.map(
        (p) =>
          `- "${p.prompt.slice(0, 80)}" → mention ${(p.mention_rate * 100).toFixed(0)}%, pos ${p.avg_position ?? "—"}`,
      ),
      ``,
      `Винеси verdict — одне з трьох:`,
      `- "clash": фраза вже зайнята competitor-ом у Tavily АБО panel mention rate помітно нижче за baseline.`,
      `- "caution": panel mention rate близько baseline (±5%) АБО неоднозначний phrase availability.`,
      `- "clear": фраза вільна, panel rate ≥ baseline + 5%.`,
      ``,
      `Reasoning: 2-3 речення українською, посилайся на конкретні цифри і findings.`,
    ].join("\n");

    const { object } = await generateObjectAnthropic({
      schema: PrelaunchVerdictSynthesisSchema,
      prompt: synthesisPrompt,
      model: "claude-sonnet-4-6",
      organization_id,
      operation: "prelaunch:synthesize",
      schemaName: "PrelaunchVerdictSynthesis",
      temperature: 0.3,
      maxTokens: 600,
      run_id: runRow.id,
    });
    return object;
  });

  // 5. persist — INSERT prelaunch_checks row
  await step.run("persist-check", async () => {
    const supabase = createServiceClient();
    const cost_usd_cents = await sumRunCost(runRow.id);

    const evidence_refs: string[] = [
      ...phraseAvailability.evidence_urls,
      `peec-snapshot:${context.brand_name}`,
    ];

    const { error } = await supabase.from("prelaunch_checks").insert({
      id: check_id,
      organization_id,
      brand_slug,
      draft_phrasing,
      category_hint: category_hint ?? null,
      verdict: synthesis.verdict,
      verdict_reasoning: synthesis.reasoning,
      baseline: PrelaunchBaselineSchema.parse(context.baseline) as unknown as Json,
      phrase_availability: phraseAvailability as unknown as Json,
      llm_panel_results: panelResults as unknown as Json,
      cost_usd_cents,
      evidence_refs: evidence_refs.length > 0 ? evidence_refs : ["prelaunch-check"],
      created_by: requested_by,
      run_id: runRow.id,
    });
    if (error) throw error;
  });

  // 6. finalize-run
  await step.run("finalize-run", async () => {
    const cost_usd_cents = await sumRunCost(runRow.id);
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: true,
        reason: `prelaunch ${synthesis.verdict}`,
        stats: {
          function_name: "prelaunch-check",
          started_at: startedAt,
          duration_seconds: Math.round((Date.now() - startMs) / 1000),
          verdict: synthesis.verdict,
          panel_prompts: context.panel_prompts.length,
          phrase_taken: phraseAvailability.taken,
          cost_usd_cents,
        } as unknown as Json,
      })
      .eq("id", runRow.id);
    if (error) throw error;
  });

  logger.info("prelaunch-check complete", {
    run_id: runRow.id,
    check_id,
    verdict: synthesis.verdict,
  });

  return {
    ok: true,
    run_id: runRow.id,
    check_id,
    verdict: synthesis.verdict,
  };
}

export const prelaunchCheck = inngest.createFunction(
  { id: "prelaunch-check", name: "W5 Pre-Launch Check" },
  { event: "prelaunch.check-request" },
  async (ctx) =>
    __prelaunchCheckHandler({
      event: ctx.event as { data: import("@/lib/events").PrelaunchCheckRequest },
      step: ctx.step as unknown as {
        run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
      },
      logger: ctx.logger,
    }),
);
