// W6′ Morning Brief (Slack send). Per features/morning-brief.md §5 + CONTRACTS.md §2.10.
//
// Trigger: event "morning-brief.tick" з payload MorningBriefTick. Active path =
// call_preference="markdown" → real Slack webhook send. Voice paths
// (voice-agent/tts) are [DEFERRED] post-hackathon — we log a warning and fall
// through до markdown so demo manual-trigger never bricks.
//
// Step graph:
//   1. gather-yesterday-data  — signals last 24h + drafts pending + brand_pulse from Peec snapshot
//   2. synthesize-brief       — generateObjectOpenAI (gpt-4o-mini, MorningBriefSchema)
//   3. format-slack-blocks    — Slack Block Kit JSON via formatBriefBlocks()
//   4. send-slack             — POST to SLACK_WEBHOOK_URL; throws on HTTP error
//   5. persist-delivery       — INSERT brief_deliveries row (status=sent|failed)
//   6. persist-run            — runs row з MorningBriefRunStatsSchema
import { inngest } from "@/inngest/client";
import type { Json } from "@/lib/supabase/types";
import {
  BrandPulseSchema,
  MorningBriefSchema,
  type BrandPulse,
  type MorningBrief,
} from "@/lib/schemas/morning-brief";
import { MorningBriefRunStatsSchema } from "@/lib/schemas/run-stats";
import { sumRunCost } from "@/lib/services/cost";
import { generateObjectOpenAI } from "@/lib/services/openai";
import {
  getBrandReportHistory,
  getLatestBrandReport,
  loadPeecSnapshot,
} from "@/lib/services/peec-snapshot";
import { formatBriefBlocks, sendSlack } from "@/lib/services/slack";
import { createServiceClient } from "@/lib/supabase/server";

const HACKATHON_BRAND_NAME = "Attio";
const SLACK_RECIPIENT_FALLBACK = "#bbh-demo";

/**
 * Compute brand_pulse from a 7-day brand_report history. Returns null only
 * якщо the brand has zero reports у the snapshot at all (truly missing data).
 * sentiment_mix counts categorical sentiment labels across the window.
 */
function computeBrandPulse(
  reports: Awaited<ReturnType<typeof loadPeecSnapshot>>["brand_reports"],
  brand_name: string,
): BrandPulse | null {
  const history = reports.filter(
    (r) => r.brand_name.toLowerCase() === brand_name.toLowerCase(),
  );
  if (history.length === 0) return null;

  const latest = history.reduce((acc, row) => (row.date > acc.date ? row : acc));

  const positions = history
    .map((r) => r.position)
    .filter((p): p is number => p !== null && p !== undefined);
  const avg_position =
    positions.length === 0
      ? null
      : positions.reduce((acc, n) => acc + n, 0) / positions.length;

  const total = history.length;
  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const r of history) counts[r.sentiment] += 1;
  const sentiment_mix = {
    positive_pct: (counts.positive / total) * 100,
    neutral_pct: (counts.neutral / total) * 100,
    negative_pct: (counts.negative / total) * 100,
  };

  return BrandPulseSchema.parse({
    visibility_pct: latest.visibility * 100,
    avg_position,
    sentiment_mix,
  });
}

/** YYYY-MM-DD slice from an ISO string. */
function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Inner handler kept named so the integration test can invoke it with a
 * mocked Inngest `step` interface. Production callers go through the
 * `morningBrief` Inngest function below.
 */
export async function __morningBriefHandler({
  event,
  step,
  logger,
}: {
  event: { data: import("@/lib/events").MorningBriefTick };
  step: {
    run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
  };
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}) {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const { organization_id, run_window_start, call_preference } = event.data;

    // -----------------------------------------------------------------------
    // 0a. create-run-row — рано щоб LLM/external calls могли тегувати cost_ledger.
    // -----------------------------------------------------------------------
    // ok=true як placeholder — finalize-run overwrites з real value.
    const runId = (await step.run("create-run-row", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("runs")
        .insert({
          organization_id,
          function_name: "morning-brief",
          event_payload: event.data as unknown as Json,
          ok: true,
          started_at: startedAt,
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`[create-run-row] insert failed: ${error?.message ?? "no row"}`);
      }
      return (data as { id: string }).id;
    })) as string;

    // -----------------------------------------------------------------------
    // 0. warn-voice-deferred — voice paths are deferred; fall through до markdown.
    // -----------------------------------------------------------------------
    if (call_preference !== "markdown") {
      await step.run("warn-voice-deferred", async () => {
        logger.warn(
          "[morning-brief] voice path deferred; falling through до markdown Slack send",
          { organization_id, call_preference },
        );
        return { warned: true };
      });
    }

    // -----------------------------------------------------------------------
    // 1. gather-yesterday-data
    // -----------------------------------------------------------------------
    const gathered = await step.run("gather-yesterday-data", async () => {
      const supabase = createServiceClient();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [signalsRes, draftsRes, snapshot] = await Promise.all([
        supabase
          .from("signals")
          .select("id, severity, sentiment, summary, source_url, created_at")
          .eq("organization_id", organization_id)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("counter_drafts")
          .select("id, status, channel_hint, body")
          .eq("organization_id", organization_id)
          .eq("status", "draft"),
        loadPeecSnapshot(),
      ]);

      if (signalsRes.error) throw signalsRes.error;
      if (draftsRes.error) throw draftsRes.error;

      const signals = signalsRes.data ?? [];
      const drafts = draftsRes.data ?? [];

      const severity_breakdown = {
        high: signals.filter((s) => s.severity === "high").length,
        med: signals.filter((s) => s.severity === "med").length,
        low: signals.filter((s) => s.severity === "low").length,
      };

      const brand_pulse = computeBrandPulse(
        snapshot.brand_reports,
        HACKATHON_BRAND_NAME,
      );

      // Latest brand report = pointer for evidence_refs even якщо history empty.
      const latestReport = getLatestBrandReport(snapshot, HACKATHON_BRAND_NAME);
      const peecEvidence = latestReport
        ? [
            `peec-snapshot:${snapshot.captured_at}`,
            `https://app.peec.ai/projects/${snapshot.project_id}/brands/${latestReport.brand_id}`,
          ]
        : [`peec-snapshot:${snapshot.captured_at}`];

      // Side-effect: warm history into evidence — used лише сам lookback в LLM context.
      void getBrandReportHistory(snapshot, HACKATHON_BRAND_NAME, 7);

      return {
        signals,
        drafts,
        severity_breakdown,
        brand_pulse,
        peec_evidence: peecEvidence,
        snapshot_captured_at: snapshot.captured_at,
      };
    });

    // -----------------------------------------------------------------------
    // 2. synthesize-brief
    // -----------------------------------------------------------------------
    const brief = await step.run("synthesize-brief", async () => {
      const delivery_date = isoDate(new Date().toISOString());

      const topSignalsBlock =
        gathered.signals.slice(0, 5).map((s, i) => {
          const tag = s.severity === "high" ? "[HIGH]" : s.severity === "med" ? "[MED]" : "[LOW]";
          return `${i + 1}. ${tag} ${s.summary} (${s.source_url})`;
        }).join("\n") || "(no signals in last 24h)";

      const draftsBlock =
        gathered.drafts.slice(0, 3).map((d, i) =>
          `${i + 1}. (${d.channel_hint}) ${d.body.slice(0, 200)}`,
        ).join("\n") || "(no pending drafts)";

      const pulseBlock = gathered.brand_pulse
        ? [
            `Visibility: ${gathered.brand_pulse.visibility_pct?.toFixed(1)}%`,
            `Avg position: ${gathered.brand_pulse.avg_position?.toFixed(1) ?? "n/a"}`,
            gathered.brand_pulse.sentiment_mix
              ? `Sentiment mix: +${gathered.brand_pulse.sentiment_mix.positive_pct.toFixed(0)} / ~${gathered.brand_pulse.sentiment_mix.neutral_pct.toFixed(0)} / -${gathered.brand_pulse.sentiment_mix.negative_pct.toFixed(0)}`
              : "Sentiment mix: n/a",
          ].join("\n")
        : "Brand pulse: no Peec data available yet.";

      // Pre-compute evidence_refs the LLM MUST echo so the schema check
      // (.min(1)) cannot fail on a cold-start org with zero signals.
      const signal_evidence = gathered.signals.map((s) => s.id);
      const baseEvidence = [...gathered.peec_evidence, ...signal_evidence];

      const prompt = [
        `You are drafting a Slack-flavored markdown morning brief for the ${HACKATHON_BRAND_NAME} brand intelligence team.`,
        `Window: signals from the last 24h. Today is ${delivery_date} (UTC).`,
        ``,
        `# Top signals`,
        topSignalsBlock,
        ``,
        `# Drafts pending review`,
        draftsBlock,
        ``,
        `# Brand pulse (Peec snapshot ${gathered.snapshot_captured_at})`,
        pulseBlock,
        ``,
        `Constraints:`,
        `- summary_body: Slack-flavored markdown, ≤ 1900 chars (HARD LIMIT — Slack truncates over 2000). Use *bold* not **bold**, _italic_, lists with "•".`,
        `- Sections: TL;DR (2-3 sentences) → Top signals (≤3 bullets, high severity first) → Drafts pending → Brand pulse → CTA.`,
        `- delivery_date = "${delivery_date}".`,
        `- signal_count = ${gathered.signals.length}. severity_breakdown = {high: ${gathered.severity_breakdown.high}, med: ${gathered.severity_breakdown.med}, low: ${gathered.severity_breakdown.low}}.`,
        `- drafts_pending = ${gathered.drafts.length}.`,
        `- brand_pulse: copy the values verbatim — visibility_pct=${gathered.brand_pulse?.visibility_pct ?? "null"}, avg_position=${gathered.brand_pulse?.avg_position ?? "null"}, sentiment_mix=${gathered.brand_pulse?.sentiment_mix ? JSON.stringify(gathered.brand_pulse.sentiment_mix) : "null"}.`,
        `- evidence_refs MUST include every signal id (${signal_evidence.length} ids) plus the Peec snapshot pointers. If signals=0, fall back to ["${gathered.peec_evidence[0]}"] alone.`,
        `- If signals=0 and drafts=0, still output a "quiet day" brief (≥50 chars).`,
      ].join("\n");

      const { object } = await generateObjectOpenAI<MorningBrief>({
        schema: MorningBriefSchema,
        prompt,
        model: "gpt-4o-mini",
        organization_id,
        operation: "morning-brief:synthesize",
        schemaName: "MorningBrief",
        temperature: 0.4,
        run_id: runId,
      });

      // Defensive: ensure evidence_refs not empty (LLM might drop them) and
      // truncate summary_body to 2000 if over (Zod will throw otherwise).
      const evidence_refs = object.evidence_refs.length > 0
        ? object.evidence_refs
        : baseEvidence.length > 0
          ? baseEvidence
          : [`peec-snapshot:${gathered.snapshot_captured_at}`];

      const summary_body =
        object.summary_body.length > 2000
          ? object.summary_body.slice(0, 1999) + "…"
          : object.summary_body;

      return MorningBriefSchema.parse({
        ...object,
        delivery_date,
        signal_count: gathered.signals.length,
        severity_breakdown: gathered.severity_breakdown,
        drafts_pending: gathered.drafts.length,
        brand_pulse: gathered.brand_pulse,
        evidence_refs,
        summary_body,
      });
    });

    // -----------------------------------------------------------------------
    // 3. format-slack-blocks
    // -----------------------------------------------------------------------
    const blocks = await step.run("format-slack-blocks", async () => {
      return formatBriefBlocks({
        summary_body: brief.summary_body,
        severity_breakdown: brief.severity_breakdown,
        drafts_pending: brief.drafts_pending,
        brand_pulse: brief.brand_pulse,
      });
    });

    // -----------------------------------------------------------------------
    // 4. send-slack
    // -----------------------------------------------------------------------
    type SendResult =
      | { ok: true }
      | { ok: false; error_reason: string };

    const sendResult: SendResult = await step.run("send-slack", async () => {
      const webhook_url = process.env.SLACK_WEBHOOK_URL;
      if (!webhook_url) {
        return {
          ok: false as const,
          error_reason: "SLACK_WEBHOOK_URL env var is not set",
        };
      }
      try {
        await sendSlack({
          webhook_url,
          blocks,
          text_fallback: brief.summary_body,
        });
        return { ok: true as const };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Surface the failure to the delivery row but keep the run going.
        return { ok: false as const, error_reason: msg.slice(0, 500) };
      }
    });

    // -----------------------------------------------------------------------
    // 5. persist-delivery
    // -----------------------------------------------------------------------
    const deliveryId = await step.run("persist-delivery", async () => {
      const supabase = createServiceClient();
      const recipient = process.env.SLACK_DEMO_CHANNEL ?? SLACK_RECIPIENT_FALLBACK;
      const { data, error } = await supabase
        .from("brief_deliveries")
        .insert({
          organization_id,
          delivery_date: brief.delivery_date,
          channel: "slack",
          recipient,
          summary_body: brief.summary_body,
          status: sendResult.ok ? "sent" : "failed",
          sent_at: sendResult.ok ? new Date().toISOString() : null,
          error_reason: sendResult.ok ? null : sendResult.error_reason,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    });

    // -----------------------------------------------------------------------
    // 6. finalize-run — UPDATE existing row з final stats + ok + finished_at.
    // -----------------------------------------------------------------------
    await step.run("finalize-run", async () => {
      const supabase = createServiceClient();
      const cost_usd_cents = await sumRunCost(runId);
      const stats = MorningBriefRunStatsSchema.parse({
        function_name: "morning-brief",
        started_at: startedAt,
        duration_seconds: Math.round((Date.now() - startMs) / 1000),
        delivery_channel: "slack",
        delivered: sendResult.ok,
        signals_summarized: brief.signal_count,
        cost_usd_cents,
      });

      const { error: updErr } = await supabase
        .from("runs")
        .update({
          ok: sendResult.ok,
          reason: sendResult.ok
            ? `slack delivered ${brief.signal_count} signal${brief.signal_count === 1 ? "" : "s"}`
            : `slack send failed: ${sendResult.error_reason}`,
          finished_at: new Date().toISOString(),
          stats: stats as unknown as Json,
        })
        .eq("id", runId);
      if (updErr) throw updErr;
    });

    // run_window_start is part of contract; surface it in the structured log
    // so debugging dispatcher quirks does not require pulling event payload.
    logger.info("morning-brief complete", {
      run_id: runId,
      delivery_id: deliveryId,
      run_window_start,
      delivered: sendResult.ok,
      signals: brief.signal_count,
    });

    return {
      ok: sendResult.ok,
      run_id: runId,
      delivery_id: deliveryId,
      reason: sendResult.ok ? null : sendResult.error_reason,
    };
}

export const morningBrief = inngest.createFunction(
  { id: "morning-brief", name: "W6′ Morning Brief", retries: 3 },
  { event: "morning-brief.tick" },
  async (ctx) =>
    __morningBriefHandler({
      event: ctx.event as { data: import("@/lib/events").MorningBriefTick },
      step: ctx.step as unknown as { run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T> },
      logger: ctx.logger,
    }),
);

export const morningBriefSchedule = inngest.createFunction(
  { id: "morning-brief-schedule", name: "W6′ Schedule (daily 08:00 UTC)" },
  { cron: "TZ=UTC 0 8 * * *" },
  async ({ step, logger }) => {
    const organization_id = process.env.DEMO_BRAND_ID;
    if (!organization_id) {
      logger.warn("morning-brief-schedule skipped: DEMO_BRAND_ID not set");
      return { skipped: true as const };
    }
    await step.sendEvent("emit-brief-tick", {
      name: "morning-brief.tick",
      data: {
        organization_id,
        run_window_start: new Date().toISOString(),
        call_preference: "markdown" as const,
      },
    });
    return { ok: true as const, organization_id };
  },
);
