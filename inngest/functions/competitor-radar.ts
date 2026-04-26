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
  buildPeecCompetitorContext,
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
const TAVILY_RESULTS_PER_SOCIAL_QUERY = 2;
const TAVILY_NEWS_DAYS = 2;
const MAX_TAVILY_PER_RADAR_RUN = 30;
const PEEC_DEDUP_LOOKBACK_DAYS = 30;

type SocialChannel = "news" | "x" | "linkedin";

const SOCIAL_DOMAINS: Record<Exclude<SocialChannel, "news">, string[]> = {
  x: ["twitter.com", "x.com"],
  linkedin: ["linkedin.com"],
};

type SignalCandidate = z.infer<typeof SignalSchema> & {
  competitor_id: string | null;
  position: number | null;
  source_channel?: SocialChannel;
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

    // 0. Create run row рано — щоб усі subsequent external API calls
    //    могли тегувати cost_ledger rows з run_id. Без цього sumRunCost(runId)
    //    повертає 0 бо recordCost пише з null run_id.
    //    Initial stats — placeholder; finalize-run UPDATE'ить наприкінці.
    const runId = (await step.run("create-run", async () => {
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
        };
      };
      const placeholderStats = RadarRunStatsSchema.parse({
        function_name: "competitor-radar" as const,
        started_at: startedAt.toISOString(),
        duration_seconds: 0,
        sources_scanned: 0,
        signals_total: 0,
        signals_by_severity: { high: 0, med: 0, low: 0 },
        drafts_generated: 0,
        cost_usd_cents: 0,
      });
      // ok=false placeholder (DB NOT NULL). finalize-run UPDATE'ить на true.
      // На fail row залишається ok=false → коректна failed-run semantics.
      const { data, error } = await supabase
        .from("runs")
        .insert({
          organization_id,
          function_name: "competitor-radar",
          event_payload: event.data as unknown as Record<string, unknown>,
          ok: false,
          started_at: startedAt.toISOString(),
          finished_at: null,
          stats: placeholderStats as unknown as Record<string, unknown>,
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`[create-run] insert failed: ${error?.message ?? "no row"}`);
      }
      return data.id;
    })) as string;

    // 1. Load competitors -----------------------------------------------------
    //    Виключаємо relationship='self' (own brand) — radar моніторить тільки
    //    зовнішні бренди. Без цього filter Attio попадав у signals і counter-
    //    drafts проти самих себе (видно у /demo/attio?tab=signals).
    const competitors = (await step.run("load-competitors", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("competitors")
        .select("id, display_name, search_terms, is_active, relationship")
        .eq("organization_id", organization_id)
        .eq("is_active", true)
        .neq("relationship", "self");
      if (error) {
        throw new Error(`[load-competitors] ${error.message}`);
      }
      return (data ?? []) as CompetitorRow[];
    })) as CompetitorRow[];

    // 2. Load Peec snapshot ---------------------------------------------------
    const snapshot = (await step.run("peec-load-snapshot", async () => {
      return (await loadPeecSnapshot()) as PeecSnapshotFile;
    })) as PeecSnapshotFile;

    // 2a. Build Peec context per competitor — pure in-memory derive, no I/O.
    //     Used downstream as cross-source enrichment: the Tavily classifier
    //     and Tavily-side counter-draft generation get the competitor's
    //     current Peec footprint so they don't reason about a news article
    //     in isolation. Loud headline + flat Peec ⇒ noise; mild headline +
    //     climbing Peec ⇒ real movement. Zero extra API cost — snapshot is
    //     already in memory from step 2.
    const peecContextByCompetitorId = new Map<string, string>();
    for (const comp of competitors) {
      const ctx = buildPeecCompetitorContext(snapshot, comp.display_name);
      if (ctx) peecContextByCompetitorId.set(comp.id, ctx);
    }

    // 3. Peec delta detect ----------------------------------------------------
    //    Two branches per competitor:
    //    - history.length === 1 → low-severity baseline signal (informational).
    //      Дозволяє Peec coverage показати навіть на single-day snapshot. Refresh
    //      peec-snapshot.json через MCP щоб включити delta detection.
    //    - history.length >= 2 → standard delta detection (visibility/position/
    //      sentiment thresholds). Generates med/high signals via severityFromPeec.
    const peecCandidates = (await step.run("peec-delta-detect", async () => {
      const out: SignalCandidate[] = [];
      for (const comp of competitors) {
        const history = getBrandReportHistory(snapshot, comp.display_name, 2);
        if (history.length === 0) continue; // no Peec data — skip silently

        const peecBrand = snapshot.brands.find(
          (b) => b.name.toLowerCase() === comp.display_name.toLowerCase(),
        );
        const curr = history[0];
        const sourceUrl = `https://app.peec.ai/projects/${snapshot.project_id}/brands/${peecBrand?.id ?? curr.brand_id}`;
        const peecMeta = {
          captured_at: snapshot.captured_at,
          project_id: snapshot.project_id,
          brand_id: peecBrand?.id ?? curr.brand_id,
        };

        // Single-day branch: Peec snapshot exists but no prior day для delta.
        // Generate low-severity informational signal. Coverage > silence.
        if (history.length === 1) {
          out.push({
            source_type: "peec_delta",
            source_url: sourceUrl,
            severity: "low",
            sentiment: curr.sentiment,
            summary: `${comp.display_name} Peec baseline: visibility ${curr.visibility.toFixed(2)}, share-of-voice ${curr.share_of_voice.toFixed(2)}, sentiment ${curr.sentiment}, position ${curr.position ?? "n/a"}.`,
            reasoning: `Single-day Peec snapshot — no prior day for delta detection. Refresh peec-snapshot.json via MCP to get real movement signals.`,
            evidence_refs: [sourceUrl],
            competitor_id: comp.id,
            position: curr.position,
            peec_meta: peecMeta,
          });
          continue;
        }

        // Two+ days available — standard delta detection.
        const prev = history[1];
        const visDelta = pctDelta(curr.visibility, prev.visibility);
        const posDelta =
          curr.position !== null && prev.position !== null
            ? Math.abs(curr.position - prev.position)
            : 0;
        const sentimentFlipped = curr.sentiment !== prev.sentiment;

        const movement = visDelta > 0.1 || posDelta > 1 || sentimentFlipped;
        if (!movement) continue;

        const severity = severityFromPeec(visDelta, posDelta, sentimentFlipped);

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
          peec_meta: peecMeta,
        });
      }
      return out;
    })) as SignalCandidate[];

    // 3a. Peec per-prompt signals -------------------------------------------
    //    For each Peec prompt × competitor — обчислити mention_rate з
    //    snapshot.chats з matching prompt_id. Якщо competitor згаданий хоча б
    //    у одному chat — emit signal. Severity proportional to mention_rate
    //    (high when competitor dominates query, indicating Attio's own gap).
    //    Source URL deeplinks до Peec project prompt page для evidence.
    //    Розширюється autoматично коли peec-snapshot.json content updated
    //    (more prompts → more signals, без code change).
    const peecPromptCandidates = (await step.run("peec-per-prompt-signals", async () => {
      const out: SignalCandidate[] = [];
      const allChats = snapshot.chats ?? [];
      const allPrompts = snapshot.prompts ?? [];
      // Pre-build prompt → chats lookup для O(1) per prompt.
      const chatsByPromptId = new Map<string, typeof allChats>();
      for (const chat of allChats) {
        const arr = chatsByPromptId.get(chat.prompt_id) ?? [];
        arr.push(chat);
        chatsByPromptId.set(chat.prompt_id, arr);
      }

      // Own brand — needed to detect Attio absence (gap signal).
      const ownBrand = snapshot.brands.find((b) => b.is_own === true);

      // Extract the first sentence containing competitorName from AI responses.
      // messages are z.unknown() in schema so we cast to a minimal shape.
      type Msg = { role: string; content: string };
      function extractAiSnippet(
        chats: typeof allChats,
        competitorName: string,
        maxLen = 200,
      ): string | null {
        const nameLower = competitorName.toLowerCase();
        for (const chat of chats) {
          const asst = (chat.messages as Msg[]).find((m) => m.role === "assistant");
          if (!asst?.content) continue;
          const sentence = asst.content
            .split(/(?<=[.!?])\s+/)
            .find((s: string) => s.toLowerCase().includes(nameLower));
          const raw = sentence ?? asst.content;
          return raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
        }
        return null;
      }

      for (const prompt of allPrompts) {
        const chatsForPrompt = chatsByPromptId.get(prompt.id) ?? [];
        if (chatsForPrompt.length === 0) continue;
        const totalChats = chatsForPrompt.length;

        // Own brand mention count for this prompt — used for gap detection.
        const ownMentionCount = ownBrand
          ? chatsForPrompt.filter((c) =>
              c.brands_mentioned.some(
                (b) =>
                  b.toLowerCase() === ownBrand.name.toLowerCase() ||
                  b === ownBrand.id,
              ),
            ).length
          : null;

        for (const comp of competitors) {
          const peecBrand = snapshot.brands.find(
            (b) => b.name.toLowerCase() === comp.display_name.toLowerCase(),
          );
          if (!peecBrand) continue;
          const brandNameLower = comp.display_name.toLowerCase();

          // Match by brand name OR brand id у brands_mentioned (snapshot uses
          // mixed identifiers depending on Peec MCP version).
          const mentionedChats = chatsForPrompt.filter((c) =>
            c.brands_mentioned.some(
              (b) =>
                b.toLowerCase() === brandNameLower ||
                b === peecBrand.id,
            ),
          );
          if (mentionedChats.length === 0) continue;

          const mentionRate = mentionedChats.length / totalChats;
          // n < 3 capped at "low" — 1/1=100% is statistically meaningless and
          // would incorrectly trigger auto-draft fan-out for a single sample.
          const severity: "low" | "med" | "high" =
            totalChats < 3
              ? "low"
              : mentionRate >= 0.7
              ? "high"
              : mentionRate >= 0.4
              ? "med"
              : "low";

          const sourceUrl = `https://app.peec.ai/projects/${snapshot.project_id}/prompts/${prompt.id}`;
          const promptText =
            prompt.text.length > 100 ? `${prompt.text.slice(0, 97)}…` : prompt.text;

          const snippet = extractAiSnippet(mentionedChats, comp.display_name);
          const attioAbsent = ownMentionCount === 0;

          const summaryParts = [
            `${comp.display_name} dominates "${promptText}" (${mentionedChats.length}/${totalChats} AI responses).`,
          ];
          if (snippet) summaryParts.push(`AI said: "${snippet}"`);
          if (attioAbsent) summaryParts.push(`Attio not mentioned.`);

          const reasoningGap = attioAbsent
            ? ` Attio had 0 mentions in this prompt — direct gap.`
            : ownMentionCount !== null
            ? ` Attio mentioned in ${ownMentionCount}/${totalChats} responses.`
            : "";

          out.push({
            source_type: "peec_delta",
            source_url: sourceUrl,
            severity,
            sentiment: "neutral",
            summary: summaryParts.join(" "),
            reasoning: `Peec prompt-level signal: competitor ${comp.display_name} appears in ${mentionedChats.length} of ${totalChats} LLM responses to "${promptText}". High mention_rate means the competitor owns this query category.${reasoningGap}${totalChats < 3 ? " Low confidence — fewer than 3 chat samples." : ""}`,
            evidence_refs: [sourceUrl],
            competitor_id: comp.id,
            position: null,
            peec_meta: {
              captured_at: snapshot.captured_at,
              project_id: snapshot.project_id,
              brand_id: peecBrand.id,
            },
          });
        }
      }
      return out;
    })) as SignalCandidate[];

    // Combined pool — both delta/baseline (step 3) і per-prompt (step 3a) signals
    // flow through same dedup/persist downstream. Source type залишається
    // "peec_delta" тому UI tag'ить як 📊 Peec. Build new array замість мутації
    // step.run result (Inngest replay-safe pattern).
    const allPeecCandidates: SignalCandidate[] = [
      ...peecCandidates,
      ...peecPromptCandidates,
    ];

    // 4. Tavily supplement (3 parallel queries: news + x + linkedin) ----------
    //    Per (competitor, term) we fan out to 3 channels — news index (last 2d),
    //    Twitter/X domain restrict, LinkedIn domain restrict. Each result is
    //    tagged з source_channel which downstream prompts reference for tone.
    //    Hard cap MAX_TAVILY_PER_RADAR_RUN protects cost spike on misconfig.
    const tavilyRaw = (await step.run("tavily-supplement", async () => {
      const collected: Array<{
        competitor_id: string;
        url: string;
        title: string | null;
        content: string | null;
        query: string;
        source_channel: SocialChannel;
      }> = [];
      let callsMade = 0;
      const overCap = () => callsMade >= MAX_TAVILY_PER_RADAR_RUN;

      for (const comp of competitors) {
        if (overCap()) break;
        const terms = comp.search_terms.slice(0, TAVILY_TERMS_PER_COMPETITOR);
        for (const term of terms) {
          if (overCap()) break;
          const query = `${comp.display_name} ${term}`;

          // Build the 3 parallel Tavily calls. Each call counts toward the cap;
          // we pre-check + decrement remaining slots so a single (comp, term)
          // either runs all 3 or none — keeps the data shape consistent.
          if (callsMade + 3 > MAX_TAVILY_PER_RADAR_RUN) {
            logger.warn?.("[tavily-supplement] cost cap reached, skipping rest", {
              callsMade,
              cap: MAX_TAVILY_PER_RADAR_RUN,
            });
            break;
          }
          callsMade += 3;

          const calls: Array<Promise<{
            channel: SocialChannel;
            results: Array<{ url: string; title: string | null; content: string | null }>;
          }>> = [
            tavilySearch({
              query,
              topic: "news",
              days: TAVILY_NEWS_DAYS,
              max_results: TAVILY_RESULTS_PER_QUERY,
              organization_id,
              run_id: runId,
            })
              .then((res) => ({
                channel: "news" as SocialChannel,
                results: res.results.map((r) => ({
                  url: r.url,
                  title: r.title ?? null,
                  content: r.content ?? null,
                })),
              }))
              .catch((err) => {
                logger.warn?.("[tavily-supplement] news query failed", {
                  query,
                  err: (err as Error).message,
                });
                return { channel: "news" as SocialChannel, results: [] };
              }),
            tavilySearch({
              query,
              include_domains: SOCIAL_DOMAINS.x,
              max_results: TAVILY_RESULTS_PER_SOCIAL_QUERY,
              organization_id,
              run_id: runId,
            })
              .then((res) => ({
                channel: "x" as SocialChannel,
                results: res.results.map((r) => ({
                  url: r.url,
                  title: r.title ?? null,
                  content: r.content ?? null,
                })),
              }))
              .catch((err) => {
                logger.warn?.("[tavily-supplement] x query failed", {
                  query,
                  err: (err as Error).message,
                });
                return { channel: "x" as SocialChannel, results: [] };
              }),
            tavilySearch({
              query,
              include_domains: SOCIAL_DOMAINS.linkedin,
              max_results: TAVILY_RESULTS_PER_SOCIAL_QUERY,
              organization_id,
              run_id: runId,
            })
              .then((res) => ({
                channel: "linkedin" as SocialChannel,
                results: res.results.map((r) => ({
                  url: r.url,
                  title: r.title ?? null,
                  content: r.content ?? null,
                })),
              }))
              .catch((err) => {
                logger.warn?.("[tavily-supplement] linkedin query failed", {
                  query,
                  err: (err as Error).message,
                });
                return { channel: "linkedin" as SocialChannel, results: [] };
              }),
          ];

          const channelResults = await Promise.all(calls);
          for (const cr of channelResults) {
            for (const r of cr.results) {
              collected.push({
                competitor_id: comp.id,
                url: r.url,
                title: r.title,
                content: r.content,
                query,
                source_channel: cr.channel,
              });
            }
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
      source_channel: SocialChannel;
    }>;

    // 5. Dedup ----------------------------------------------------------------
    //    peec_delta signals dedup on (source_url, competitor_id) — both fields
    //    are stable across radar ticks. Earlier the key included `summary`,
    //    which broke when the summary template was edited (e.g. Ukrainian "y"
    //    → English "in") — the same competitor + same Peec prompt URL would
    //    re-fire under a slightly different summary string. Now phrasing
    //    changes don't create false duplicates.
    //
    //    Tavily signals continue to dedup on URL alone — same article = same
    //    signal regardless of source_channel.
    //
    //    In-batch peec dedup: same (source_url, competitor_id) can appear
    //    twice within one tick if step 3 (delta) and step 3a (per-prompt)
    //    both produce a row for the same combination — dedup the batch
    //    locally before persisting.
    const dedupResult = (await step.run("dedup", async () => {
      const supabase = createServiceClient();
      const cutoffIso = new Date(
        Date.now() - PEEC_DEDUP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data: existing, error } = await supabase
        .from("signals")
        .select("source_url, source_type, competitor_id")
        .eq("organization_id", organization_id)
        .gte("created_at", cutoffIso);
      if (error) {
        throw new Error(`[dedup] ${error.message}`);
      }
      const existingTavilyUrls = new Set<string>();
      const existingPeecKeys = new Set<string>();
      for (const row of existing ?? []) {
        if (row.source_type === "peec_delta") {
          existingPeecKeys.add(`${row.source_url}|${row.competitor_id ?? ""}`);
        } else {
          existingTavilyUrls.add(row.source_url);
        }
      }

      const seenPeecBatch = new Set<string>();
      const dedupedPeec = allPeecCandidates.filter((p) => {
        const key = `${p.source_url}|${p.competitor_id ?? ""}`;
        if (existingPeecKeys.has(key)) return false;
        if (seenPeecBatch.has(key)) return false;
        seenPeecBatch.add(key);
        return true;
      });

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
        source_channel: SocialChannel;
      }>;
    };

    // 6. Classify Tavily-only signals via Anthropic ---------------------------
    //    Anthropic prompt now includes source_channel ("news"|"x"|"linkedin") so
    //    severity/sentiment classification can weigh louder socials signals
    //    higher when warranted.
    const classifiedTavily = (await step.run("classify-tavily", async () => {
      const out: SignalCandidate[] = [];
      for (const t of dedupResult.dedupedTavily) {
        const channelHint =
          t.source_channel === "x"
            ? "Twitter/X post"
            : t.source_channel === "linkedin"
              ? "LinkedIn post"
              : "News article";

        // Cross-source severity calibration. The Tavily LLM otherwise reads
        // an article in isolation and picks severity from headline tone —
        // which over-rates loud PR and under-rates real momentum. We inject
        // the competitor's current Peec footprint and tell the model to
        // weight severity in light of real AI-engine traction.
        const peecContext = peecContextByCompetitorId.get(t.competitor_id);
        const peecBlock = peecContext
          ? [
              ``,
              `--- Cross-source context: Peec brand-engine state ---`,
              peecContext,
              `--- end context ---`,
              ``,
              `Severity calibration rule: weight severity by combining the article's competitive`,
              `impact with the Peec footprint above. Loud headline + flat / declining Peec metrics`,
              `usually means PR noise, not material movement — bias toward "low" or "med". Mild`,
              `headline + climbing Peec visibility/share-of-voice or improving (lower-number) avg`,
              `position usually means a real, retrievable shift — bias toward "med" or "high".`,
              `Sentiment flip in Peec is itself a high-severity signal regardless of article tone.`,
            ].join("\n")
          : "";

        const promptLines: string[] = [
          `Classify this competitor signal for brand-intelligence purposes.`,
          ``,
          `Source channel: ${t.source_channel} (${channelHint})`,
          `Query: ${t.query}`,
          `URL: ${t.url}`,
          `Title: ${t.title ?? "(no title)"}`,
          `Excerpt: ${(t.content ?? "").slice(0, 1200)}`,
        ];
        if (peecBlock) promptLines.push(peecBlock);
        promptLines.push(
          ``,
          `Determine source_type (always "competitor" here), severity (low/med/high based on competitive impact —`,
          `socials launches and viral threads typically warrant med/high), sentiment (positive/neutral/negative),`,
          `a 20-500 char summary, and ≥20 char reasoning. Mention the source channel in summary or reasoning.`,
        );
        if (peecContext) {
          promptLines.push(
            `If Peec context informed the severity decision, reference it in your reasoning (e.g. "loud headline but flat Peec visibility").`,
          );
        }
        promptLines.push(`evidence_refs MUST contain at least the source URL.`);
        const prompt = promptLines.join("\n");

        const { object } = await generateObjectAnthropic({
          schema: SignalSchema,
          prompt,
          model: "claude-haiku-4-5-20251001",
          organization_id,
          operation: "classify-signal",
          schemaName: "Signal",
          schemaDescription: "W9 competitor radar signal classification",
          maxTokens: 600,
          temperature: 0.2,
          run_id: runId,
        });

        out.push({
          ...object,
          source_type: "competitor",
          source_url: t.url,
          competitor_id: t.competitor_id,
          position: null,
          source_channel: t.source_channel,
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
        metadata: c.source_channel
          ? { source_channel: c.source_channel }
          : {},
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

        const channelLine = c.source_channel
          ? `Origin channel: ${c.source_channel} (${c.source_channel === "x" ? "Twitter/X thread" : c.source_channel === "linkedin" ? "LinkedIn post" : "news article"}). Lean toward responding on the same channel where natural.`
          : `Origin: Peec snapshot delta (no specific channel).`;

        // Cross-source enrichment for Tavily-sourced drafts: inject the
        // competitor's Peec footprint so the counter body can reference
        // concrete brand-engine numerics ("Salesforce visibility climbed
        // 12 pp this week, but our take is...") instead of generic
        // brand-voice prose. Skipped for peec_delta drafts — those already
        // have Peec context inside their summary/reasoning.
        const peecContext =
          c.source_type === "competitor"
            ? c.competitor_id
              ? peecContextByCompetitorId.get(c.competitor_id) ?? null
              : null
            : null;
        const peecDraftBlock = peecContext
          ? [
              ``,
              `--- Cross-source context: Peec brand-engine state for this competitor ---`,
              peecContext,
              `--- end context ---`,
              ``,
              `If the Peec metrics tell a different story than the article (e.g. loud launch but`,
              `flat brand-engine visibility), the counter-narrative can lean into that gap.`,
              `Where appropriate, reference one concrete Peec numeric to ground the counter.`,
            ].join("\n")
          : "";

        const promptLines: string[] = [
          `Draft a counter-narrative reaction to the following high-severity competitor signal.`,
          ``,
          `Signal summary: ${c.summary}`,
          `Reasoning: ${c.reasoning}`,
          `Source URL: ${c.source_url}`,
          channelLine,
        ];
        if (peecDraftBlock) promptLines.push(peecDraftBlock);
        promptLines.push(
          ``,
          `Output: 50-2000 char body, channel_hint (x|linkedin|blog|multi), tone_pillar from`,
          `the brand voice (e.g. "confident-builder"), reasoning ≥20 chars explaining the angle,`,
          `and evidence_refs MUST equal: ${JSON.stringify(evidenceRefs)}.`,
        );
        const prompt = promptLines.join("\n");

        const { object } = await generateObjectAnthropic({
          schema: CounterDraftSchema,
          prompt,
          model: "claude-haiku-4-5-20251001",
          organization_id,
          operation: "counter-draft",
          schemaName: "CounterDraft",
          maxTokens: 800,
          temperature: 0.3,
          run_id: runId,
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

    // 10. Finalize run --------------------------------------------------------
    // Run row already exists (created on step 0). Sum cost з cost_ledger
    // (rows tagged з runId) → UPDATE row з final stats + ok=true + finished_at.
    await step.run("finalize-run", async () => {
      const supabase = createServiceClient() as unknown as {
        from: (table: string) => {
          update: (row: Record<string, unknown>) => {
            eq: (
              col: string,
              val: string,
            ) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
      const cost = await sumRunCost(runId);
      const finalStats = RadarRunStatsSchema.parse({
        ...stats,
        cost_usd_cents: cost,
      });
      const { error: updErr } = await supabase
        .from("runs")
        .update({
          ok: true,
          finished_at: finishedAt.toISOString(),
          stats: finalStats as unknown as Record<string, unknown>,
        })
        .eq("id", runId);
      if (updErr) {
        throw new Error(`[finalize-run] update failed: ${updErr.message}`);
      }
    });

    return {
      run_id: runId,
      signals_persisted: persistedSignals.length,
      drafts_generated: draftsGenerated.length,
    };
  },
);

export const competitorRadarSchedule = inngest.createFunction(
  { id: "competitor-radar-schedule", name: "W9 Schedule (every 6h)" },
  { cron: "TZ=UTC 0 */6 * * *" },
  async ({ step, logger }) => {
    const organization_id = process.env.DEMO_BRAND_ID;
    if (!organization_id) {
      logger.warn("competitor-radar-schedule skipped: DEMO_BRAND_ID not set");
      return { skipped: true as const };
    }
    await step.sendEvent("emit-radar-tick", {
      name: "competitor-radar.tick",
      data: { organization_id, sweep_window_hours: 6 },
    });
    return { ok: true as const, organization_id };
  },
);
