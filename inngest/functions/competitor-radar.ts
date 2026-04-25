import "server-only";

import { z } from "zod";

import { inngest } from "@/inngest/client";
import { CounterDraftSchema } from "@/lib/schemas/counter-draft";
import {
  type PeecBrandReportRow,
  type PeecSnapshotFile,
} from "@/lib/schemas/peec-snapshot";
import { RadarRunStatsSchema } from "@/lib/schemas/run-stats";
import { SignalSchema } from "@/lib/schemas/signal";
import { generateObjectAnthropic } from "@/lib/services/anthropic";
import { sumRunCost } from "@/lib/services/cost";
import {
  getBrandReportHistory,
  loadPeecSnapshot,
} from "@/lib/services/peec-snapshot";
import { tavilySearch } from "@/lib/services/tavily";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * W9 — Competitor radar.
 *
 * Step graph (PIPELINES.md §W9 rev2): load competitors → load Peec snapshot →
 * detect Peec deltas → supplement з Tavily live search → dedup → classify Tavily
 * signals via Anthropic → persist signals → fan-out counter-drafts для high
 * severity → aggregate stats → persist run row. Кожен step — `step.run()`,
 * Inngest cache'ить result on retry.
 */

const TAVILY_TERMS_PER_COMPETITOR = 2;
const TAVILY_RESULTS_PER_QUERY = 3;
const PEEC_DEDUP_LOOKBACK_DAYS = 30;

type SignalCandidate = z.infer<typeof SignalSchema> & {
  competitor_id: string | null;
  position: number | null;
  // Provenance — used downstream by counter-draft fan-out для evidence_refs
  // formatting. Not persisted у DB row directly.
  peec_meta?: {
    captured_at: string;
    project_id: string;
    brand_id: string;
  };
};

type CompetitorRow = {
  id: string;
  display_name: string;
  search_terms: string[];
  is_active: boolean;
};

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 1;
  return Math.abs(curr - prev) / Math.abs(prev);
}

function severityFromPeec(
  visDelta: number,
  posDelta: number,
  sentimentFlipped: boolean,
): "low" | "med" | "high" {
  if (sentimentFlipped) return "high";
  if (visDelta > 0.2) return "high";
  if (visDelta > 0.1 || posDelta > 1) return "med";
  return "low";
}

function buildPeecSummary(
  brandName: string,
  curr: PeecBrandReportRow,
  prev: PeecBrandReportRow,
): string {
  const visPct = (pctDelta(curr.visibility, prev.visibility) * 100).toFixed(1);
  const posDelta =
    curr.position !== null && prev.position !== null
      ? Math.abs(curr.position - prev.position).toFixed(2)
      : "n/a";
  return `${brandName} Peec snapshot delta: visibility ${prev.visibility.toFixed(2)} → ${curr.visibility.toFixed(2)} (${visPct}%), position delta ${posDelta}, sentiment ${prev.sentiment} → ${curr.sentiment}.`;
}

function buildPeecReasoning(
  visDelta: number,
  posDelta: number,
  sentimentFlipped: boolean,
  severity: "low" | "med" | "high",
): string {
  const reasons: string[] = [];
  if (sentimentFlipped) reasons.push("sentiment flipped vs previous day");
  if (visDelta > 0.1) reasons.push(`visibility delta ${(visDelta * 100).toFixed(1)}%`);
  if (posDelta > 1) reasons.push(`position shift ${posDelta.toFixed(2)} ranks`);
  const head = reasons.length > 0 ? reasons.join("; ") : "below-threshold movement";
  return `Severity=${severity}. ${head}. Source: data/peec-snapshot.json delta detection.`;
}

export const competitorRadar = inngest.createFunction(
  { id: "competitor-radar", name: "W9 Competitor Radar" },
  { event: "competitor-radar.tick" },
  async ({ event, step, logger }) => {
    const startedAt = new Date();
    const { organization_id } = event.data;

    // 1. Load competitors -----------------------------------------------------
    const competitors = (await step.run("load-competitors", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("competitors")
        .select("id, display_name, search_terms, is_active")
        .eq("organization_id", organization_id)
        .eq("is_active", true);
      if (error) {
        throw new Error(`[load-competitors] ${error.message}`);
      }
      return (data ?? []) as CompetitorRow[];
    })) as CompetitorRow[];

    // 2. Load Peec snapshot ---------------------------------------------------
    const snapshot = (await step.run("peec-load-snapshot", async () => {
      return (await loadPeecSnapshot()) as PeecSnapshotFile;
    })) as PeecSnapshotFile;

    // 3. Peec delta detect ----------------------------------------------------
    const peecCandidates = (await step.run("peec-delta-detect", async () => {
      const out: SignalCandidate[] = [];
      for (const comp of competitors) {
        const history = getBrandReportHistory(snapshot, comp.display_name, 2);
        if (history.length < 2) continue; // need ≥2 days for delta

        const [curr, prev] = history;
        const visDelta = pctDelta(curr.visibility, prev.visibility);
        const posDelta =
          curr.position !== null && prev.position !== null
            ? Math.abs(curr.position - prev.position)
            : 0;
        const sentimentFlipped = curr.sentiment !== prev.sentiment;

        const movement =
          visDelta > 0.1 || posDelta > 1 || sentimentFlipped;
        if (!movement) continue;

        const severity = severityFromPeec(visDelta, posDelta, sentimentFlipped);
        const peecBrand = snapshot.brands.find(
          (b) => b.name.toLowerCase() === comp.display_name.toLowerCase(),
        );
        const sourceUrl = `https://app.peec.ai/projects/${snapshot.project_id}/brands/${peecBrand?.id ?? curr.brand_id}`;

        out.push({
          source_type: "peec_delta",
          source_url: sourceUrl,
          severity,
          sentiment: curr.sentiment,
          summary: buildPeecSummary(comp.display_name, curr, prev),
          reasoning: buildPeecReasoning(visDelta, posDelta, sentimentFlipped, severity),
          evidence_refs: [sourceUrl],
          competitor_id: comp.id,
          position: curr.position,
          peec_meta: {
            captured_at: snapshot.captured_at,
            project_id: snapshot.project_id,
            brand_id: peecBrand?.id ?? curr.brand_id,
          },
        });
      }
      return out;
    })) as SignalCandidate[];

    // 4. Tavily supplement ----------------------------------------------------
    const tavilyRaw = (await step.run("tavily-supplement", async () => {
      const collected: Array<{
        competitor_id: string;
        url: string;
        title: string | null;
        content: string | null;
        query: string;
      }> = [];
      for (const comp of competitors) {
        const terms = comp.search_terms.slice(0, TAVILY_TERMS_PER_COMPETITOR);
        for (const term of terms) {
          const query = `${comp.display_name} ${term}`;
          try {
            const res = await tavilySearch({
              query,
              max_results: TAVILY_RESULTS_PER_QUERY,
              organization_id,
            });
            for (const r of res.results) {
              collected.push({
                competitor_id: comp.id,
                url: r.url,
                title: r.title ?? null,
                content: r.content ?? null,
                query,
              });
            }
          } catch (err) {
            logger.warn?.("[tavily-supplement] query failed", {
              query,
              err: (err as Error).message,
            });
          }
        }
      }
      return collected;
    })) as Array<{
      competitor_id: string;
      url: string;
      title: string | null;
      content: string | null;
      query: string;
    }>;

    // 5. Dedup ----------------------------------------------------------------
    const dedupResult = (await step.run("dedup", async () => {
      const supabase = createServiceClient();
      const cutoffIso = new Date(
        Date.now() - PEEC_DEDUP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data: existing, error } = await supabase
        .from("signals")
        .select("source_url, source_type, summary")
        .eq("organization_id", organization_id)
        .gte("created_at", cutoffIso);
      if (error) {
        throw new Error(`[dedup] ${error.message}`);
      }
      const existingTavilyUrls = new Set<string>();
      const existingPeecKeys = new Set<string>();
      for (const row of existing ?? []) {
        if (row.source_type === "peec_delta") {
          existingPeecKeys.add(`${row.source_url}|${row.summary}`);
        } else {
          existingTavilyUrls.add(row.source_url);
        }
      }

      const dedupedPeec = peecCandidates.filter(
        (p) => !existingPeecKeys.has(`${p.source_url}|${p.summary}`),
      );

      const seenInBatch = new Set<string>();
      const dedupedTavily = tavilyRaw.filter((t) => {
        if (existingTavilyUrls.has(t.url)) return false;
        if (seenInBatch.has(t.url)) return false;
        seenInBatch.add(t.url);
        return true;
      });

      return { dedupedPeec, dedupedTavily };
    })) as {
      dedupedPeec: SignalCandidate[];
      dedupedTavily: Array<{
        competitor_id: string;
        url: string;
        title: string | null;
        content: string | null;
        query: string;
      }>;
    };

    // 6. Classify Tavily-only signals via Anthropic ---------------------------
    const classifiedTavily = (await step.run("classify-tavily", async () => {
      const out: SignalCandidate[] = [];
      for (const t of dedupResult.dedupedTavily) {
        const prompt = [
          `Classify this competitor news item for brand-intelligence purposes.`,
          ``,
          `Query: ${t.query}`,
          `URL: ${t.url}`,
          `Title: ${t.title ?? "(no title)"}`,
          `Excerpt: ${(t.content ?? "").slice(0, 1200)}`,
          ``,
          `Determine source_type (always "competitor" here), severity (low/med/high based on competitive impact),`,
          `sentiment (positive/neutral/negative), a 20-500 char summary, and ≥20 char reasoning.`,
          `evidence_refs MUST contain at least the source URL.`,
        ].join("\n");

        const { object } = await generateObjectAnthropic({
          schema: SignalSchema,
          prompt,
          model: "claude-sonnet-4-5",
          organization_id,
          operation: "classify-signal",
          schemaName: "Signal",
          schemaDescription: "W9 competitor radar signal classification",
          maxTokens: 600,
          temperature: 0.2,
        });

        out.push({
          ...object,
          source_type: "competitor",
          source_url: t.url,
          competitor_id: t.competitor_id,
          position: null,
        });
      }
      return out;
    })) as SignalCandidate[];

    // 7. Persist signals ------------------------------------------------------
    const allCandidates: SignalCandidate[] = [
      ...dedupResult.dedupedPeec,
      ...classifiedTavily,
    ];

    const persistedSignals = (await step.run("persist-signals", async () => {
      if (allCandidates.length === 0) return [] as Array<{ id: string }>;
      const supabase = createServiceClient();
      const rows = allCandidates.map((c) => ({
        organization_id,
        competitor_id: c.competitor_id,
        source_type: c.source_type,
        source_url: c.source_url,
        severity: c.severity,
        sentiment: c.sentiment,
        position: c.position,
        summary: c.summary,
        reasoning: c.reasoning,
        evidence_refs: c.evidence_refs,
        auto_draft: c.severity === "high",
      }));
      const { data, error } = await supabase
        .from("signals")
        .insert(rows)
        .select("id");
      if (error) {
        throw new Error(`[persist-signals] ${error.message}`);
      }
      return (data ?? []) as Array<{ id: string }>;
    })) as Array<{ id: string }>;

    // 8. Fan-out counter-drafts for high-severity signals ---------------------
    const highIndices = allCandidates
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => c.severity === "high");

    const draftsGenerated: string[] = [];
    for (const { c, idx } of highIndices) {
      const signalRow = persistedSignals[idx];
      if (!signalRow) continue;
      const signalId = signalRow.id;

      const draftId = (await step.run(`draft-${signalId}`, async () => {
        const evidenceRefs =
          c.source_type === "peec_delta" && c.peec_meta
            ? [
                `peec-snapshot:${c.peec_meta.captured_at}`,
                `https://app.peec.ai/projects/${c.peec_meta.project_id}/brands/${c.peec_meta.brand_id}`,
              ]
            : [signalId, c.source_url];

        const prompt = [
          `Draft a counter-narrative reaction to the following high-severity competitor signal.`,
          ``,
          `Signal summary: ${c.summary}`,
          `Reasoning: ${c.reasoning}`,
          `Source URL: ${c.source_url}`,
          ``,
          `Output: 50-2000 char body, channel_hint (x|linkedin|blog|multi), tone_pillar from`,
          `the brand voice (e.g. "confident-builder"), reasoning ≥20 chars explaining the angle,`,
          `and evidence_refs MUST equal: ${JSON.stringify(evidenceRefs)}.`,
        ].join("\n");

        const { object } = await generateObjectAnthropic({
          schema: CounterDraftSchema,
          prompt,
          model: "claude-sonnet-4-5",
          organization_id,
          operation: "counter-draft",
          schemaName: "CounterDraft",
          maxTokens: 800,
          temperature: 0.3,
        });

        // Force evidence_refs to spec'd values (LLM may drift).
        const draft = { ...object, evidence_refs: evidenceRefs };

        const supabase = createServiceClient();
        const { data, error } = await supabase
          .from("counter_drafts")
          .insert({
            organization_id,
            signal_id: signalId,
            status: "draft",
            body: draft.body,
            channel_hint: draft.channel_hint,
            tone_pillar: draft.tone_pillar,
            reasoning: draft.reasoning,
            evidence_refs: draft.evidence_refs,
          })
          .select("id")
          .single();
        if (error) {
          throw new Error(`[draft-${signalId}] ${error.message}`);
        }
        return (data as { id: string }).id;
      })) as string;

      draftsGenerated.push(draftId);
    }

    // 9. Aggregate stats ------------------------------------------------------
    const finishedAt = new Date();
    const stats = (await step.run("aggregate-stats", async () => {
      const counts = { high: 0, med: 0, low: 0 };
      for (const c of allCandidates) {
        counts[c.severity] += 1;
      }
      // sources_scanned = competitor count (Peec) + Tavily query batch size.
      const sourcesScanned =
        competitors.length + dedupResult.dedupedTavily.length + tavilyRaw.length;
      return {
        function_name: "competitor-radar" as const,
        started_at: startedAt.toISOString(),
        duration_seconds: Math.max(
          0,
          Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000),
        ),
        sources_scanned: sourcesScanned,
        signals_total: allCandidates.length,
        signals_by_severity: counts,
        drafts_generated: draftsGenerated.length,
        cost_usd_cents: 0, // overwritten in persist-run after sumRunCost
      };
    })) as ReturnType<typeof RadarRunStatsSchema.parse>;

    // 10. Persist run --------------------------------------------------------
    // Note: `as any` cast on supabase client mirrors lib/services/cost.ts —
    // generated Database types treat jsonb columns as `Json` (recursive union)
    // which TS can't reconcile with stricter Zod-parsed objects. Drop the
    // cast post `pnpm types:gen` if the types tighten.
    const runId = (await step.run("persist-run", async () => {
      const supabase = createServiceClient() as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>) => {
            select: (cols: string) => {
              single: () => Promise<{
                data: { id: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
          update: (row: Record<string, unknown>) => {
            eq: (
              col: string,
              val: string,
            ) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
      const { data: inserted, error: insErr } = await supabase
        .from("runs")
        .insert({
          organization_id,
          function_name: "competitor-radar",
          event_payload: event.data as unknown as Record<string, unknown>,
          ok: true,
          started_at: startedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
          stats: RadarRunStatsSchema.parse(stats) as unknown as Record<
            string,
            unknown
          >,
        })
        .select("id")
        .single();
      if (insErr || !inserted) {
        throw new Error(`[persist-run] insert failed: ${insErr?.message ?? "no row"}`);
      }
      const id = inserted.id;

      const cost = await sumRunCost(id);
      const finalStats = RadarRunStatsSchema.parse({
        ...stats,
        cost_usd_cents: cost,
      });
      const { error: updErr } = await supabase
        .from("runs")
        .update({ stats: finalStats as unknown as Record<string, unknown> })
        .eq("id", id);
      if (updErr) {
        throw new Error(`[persist-run] cost update failed: ${updErr.message}`);
      }
      return id;
    })) as string;

    return {
      run_id: runId,
      signals_persisted: persistedSignals.length,
      drafts_generated: draftsGenerated.length,
    };
  },
);
