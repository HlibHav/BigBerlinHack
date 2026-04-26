import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditPanel } from "@/components/dashboard/audit-panel";
import { CompetitorsPanel } from "@/components/dashboard/competitors-panel";
import { SignalsFeed } from "@/components/dashboard/signals-feed";
import { DraftsQueue } from "@/components/dashboard/drafts-queue";
import { MorningBriefPanel } from "@/components/dashboard/morning-brief-panel";
import { CostPanel } from "@/components/dashboard/cost-panel";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";
import { BrandHealthHero, BrandHealthMini } from "@/components/dashboard/brand-health-hero";
import { RealtimeRefresher } from "@/components/dashboard/realtime-refresher";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { BackToTopFab } from "@/components/dashboard/back-to-top-fab";
import { PeecDataSourceBadge } from "@/components/dashboard/peec-data-source-badge";
import { PrelaunchPanel } from "@/components/prelaunch/prelaunch-panel";
import { PodcastPrepPanel } from "@/components/dashboard/podcast-prep-panel";
import type { PrelaunchCheckRow } from "@/components/prelaunch/prelaunch-result-card";
import type {
  PrelaunchBaseline,
  PrelaunchPanelResult,
  PrelaunchPhraseAvailability,
  PrelaunchVerdict,
} from "@/lib/schemas/prelaunch-check";
import { loadPeecSnapshot, getBrandReportHistory } from "@/lib/services/peec-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DemoPage({
  params,
}: {
  params: { brand: string };
}) {
  const supabase = createServiceClient();

  // Resolve slug → org
  const { data: org } = await supabase
    .from("organizations")
    .select("id, slug, display_name, is_public_demo")
    .eq("slug", params.brand)
    .maybeSingle();

  if (!org || !org.is_public_demo) {
    notFound();
  }

  // Cost ledger query potentially missing in generated types (cast handled on the CostPanel side).
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  // Fan-out queries (parallel via Promise.all)
  const [
    { data: recentRuns },
    { data: competitors },
    { data: signals },
    { data: drafts },
    { data: variants },
    { data: contentVariants },
    { data: brief },
    { data: costRows },
    { data: prelaunchChecks },
    { data: podcastBriefs },
  ] = await Promise.all([
    supabase
      .from("runs")
      .select("id, function_name, ok, stats, started_at, finished_at")
      .eq("organization_id", org.id)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase
      .from("competitors")
      .select("id, display_name, relationship, homepage_url, handles, is_active")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("relationship", { ascending: true }),
    supabase
      .from("signals")
      .select(
        "id, severity, sentiment, position, summary, reasoning, source_type, source_url, evidence_refs, auto_draft, competitor_id, created_at"
      )
      .eq("organization_id", org.id)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("counter_drafts")
      .select(
        "id, signal_id, status, body, channel_hint, tone_pillar, reasoning, evidence_refs, created_at"
      )
      .eq("organization_id", org.id)
      .in("status", ["draft", "approved", "rejected", "published"])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("narrative_variants")
      .select(
        "id, simulator_run_id, seed_signal_id, seed_counter_draft_id, rank, body, score, score_reasoning, predicted_sentiment, avg_position, mention_rate, metadata, evidence_refs, created_at"
      )
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .order("rank", { ascending: true })
      .limit(30),
    supabase
      .from("content_variants")
      .select("id, parent_counter_draft_id, channel, title, body, metadata, status, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("brief_deliveries")
      .select("id, delivery_date, channel, recipient, status, summary_body, voice_script, sent_at, error_reason, created_at")
      .eq("organization_id", org.id)
      // Secondary order on created_at desc — multiple briefs can share the
      // same delivery_date (cron + manual «Send brief now»); without this
      // tiebreaker postgres returns an arbitrary row, sometimes hiding the
      // freshly-generated voice_script behind an older same-day brief.
      .order("delivery_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // cost_ledger may not exist in generated types yet — cast through any
    (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (k: string, v: string) => {
            gte: (k: string, v: string) => Promise<{ data: Array<{ service: string; usd_cents: number }> | null }>;
          };
        };
      };
    })
      .from("cost_ledger")
      .select("service, usd_cents")
      .eq("organization_id", org.id)
      .gte("created_at", startOfDayUtc.toISOString()),
    supabase
      .from("prelaunch_checks")
      .select(
        "id, draft_phrasing, category_hint, verdict, verdict_reasoning, baseline, phrase_availability, llm_panel_results, cost_usd_cents, evidence_refs, created_at"
      )
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("podcast_briefs")
      .select(
        "id, podcast_name, host_name, episode_topic, scheduled_date, judge_score, created_at",
      )
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Coerce jsonb fields into typed shapes for the PrelaunchPanel — types.ts
  // exposes them as Json; we trust the writer (Inngest pipeline) to obey schema.
  const prelaunchRows: PrelaunchCheckRow[] = (prelaunchChecks ?? []).map((r) => ({
    id: r.id,
    draft_phrasing: r.draft_phrasing,
    category_hint: r.category_hint,
    verdict: r.verdict as PrelaunchVerdict,
    verdict_reasoning: r.verdict_reasoning,
    baseline: r.baseline as unknown as PrelaunchBaseline,
    phrase_availability: r.phrase_availability as unknown as PrelaunchPhraseAvailability,
    llm_panel_results: r.llm_panel_results as unknown as PrelaunchPanelResult[],
    cost_usd_cents: r.cost_usd_cents,
    evidence_refs: r.evidence_refs,
    created_at: r.created_at,
  }));

  // Brand health: up to 90-day Peec history for self brand + tracked competitors.
  // Snapshot bundled in serverless. Hero shows 7d sparkline by default;
  // expanded TrendChart toggleable to 30/90d.
  type HealthReport = {
    date: string;
    visibility: number;
    share_of_voice: number;
    sentiment: "positive" | "neutral" | "negative";
    position: number | null;
  };
  let healthHistory: HealthReport[] = [];
  let competitorHistories: Array<{ brand_name: string; history: HealthReport[] }> = [];
  try {
    const snapshot = await loadPeecSnapshot();
    healthHistory = getBrandReportHistory(snapshot, org.display_name, 90).map((r) => ({
      date: r.date,
      visibility: r.visibility,
      share_of_voice: r.share_of_voice,
      sentiment: r.sentiment,
      position: r.position,
    }));
    // Pull histories for competitors (relationship !== "self") within the same organization.
    const competitorBrands = (competitors ?? []).filter(
      (c) => c.relationship !== "self" && c.is_active,
    );
    competitorHistories = competitorBrands
      .map((c) => ({
        brand_name: c.display_name,
        history: getBrandReportHistory(snapshot, c.display_name, 90).map((r) => ({
          date: r.date,
          visibility: r.visibility,
          share_of_voice: r.share_of_voice,
          sentiment: r.sentiment,
          position: r.position,
        })),
      }))
      .filter((c) => c.history.length > 0);
  } catch {
    // peec-snapshot read failure — render empty state in hero
  }

  // Maps for inline cohesion in DraftCard: signal context + simulator variants per draft
  const allSignals = signals ?? [];
  const signalsById = new Map(allSignals.map((s) => [s.id, s]));
  const allNarrativeVariants = variants ?? [];
  const narrativeVariantsByDraft = new Map<string, typeof allNarrativeVariants>();
  for (const v of allNarrativeVariants) {
    if (!v.seed_counter_draft_id) continue;
    const arr = narrativeVariantsByDraft.get(v.seed_counter_draft_id) ?? [];
    arr.push(v);
    narrativeVariantsByDraft.set(v.seed_counter_draft_id, arr);
  }
  // Filter out legacy email content variants — channel deprecated 2026-04-25.
  // Existing DB rows remain (no migration), they just don't render.
  const liveContentVariants = (contentVariants ?? []).filter(
    (v): v is typeof v & { channel: "blog" | "x_thread" | "linkedin" } =>
      v.channel === "blog" || v.channel === "x_thread" || v.channel === "linkedin",
  );

  // Latest run per function — for PipelineStatus + AuditPanel
  const allRuns = recentRuns ?? [];
  function latestFor(fn: string): typeof allRuns[number] | null {
    return allRuns.find((r) => r.function_name === fn) ?? null;
  }
  const latestRun = latestFor("competitor-radar");
  const pipelineRuns = {
    radar: latestRun,
    simulator: latestFor("narrative-simulator"),
    expand: latestFor("content-expand"),
    brief: latestFor("morning-brief"),
  };

  return (
    <main className="mx-auto max-w-5xl px-3 py-4 space-y-4 sm:px-4 sm:py-6 sm:space-y-6">
      <RealtimeRefresher organizationId={org.id} />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {org.display_name}
            <span className="ml-2 text-xs font-normal text-muted-foreground sm:text-sm">
              brand intelligence
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What LLMs are saying about {org.display_name} today, what moves competitors are making, and how to respond.
          </p>
        </div>
        <PeecDataSourceBadge />
      </header>

      <DashboardTabs
        rightSlot={<BrandHealthMini history={healthHistory} />}
        panels={{
          overview: (
            <>
              <BrandHealthHero
                history={healthHistory}
                brandName={org.display_name}
                competitorHistories={competitorHistories}
              />
              <PipelineStatus runs={pipelineRuns} />
              <AuditPanel
                organizationId={org.id}
                brandSlug={org.slug}
                latestRun={latestRun}
              />
              <CompetitorsPanel competitors={competitors ?? []} />
            </>
          ),
          signals: (
            <SignalsFeed
              signals={signals ?? []}
              competitors={competitors ?? []}
              organizationId={org.id}
              brandSlug={org.slug}
            />
          ),
          drafts: (
            <DraftsQueue
              drafts={drafts ?? []}
              contentVariants={liveContentVariants}
              signalsById={signalsById}
              narrativeVariantsByDraft={narrativeVariantsByDraft}
              organizationId={org.id}
              brandSlug={org.slug}
            />
          ),
          operations: (
            <>
              <MorningBriefPanel
                latestBrief={brief}
                organizationId={org.id}
                brandSlug={org.slug}
              />
              <CostPanel rows={costRows ?? []} />
            </>
          ),
          prelaunch: (
            <PrelaunchPanel
              organizationId={org.id}
              brandSlug={org.slug}
              brandName={org.display_name}
              checks={prelaunchRows}
            />
          ),
          "podcast-prep": (
            <PodcastPrepPanel
              briefs={(podcastBriefs ?? []).map((b) => ({
                id: b.id,
                podcast_name: b.podcast_name,
                host_name: b.host_name,
                episode_topic: b.episode_topic,
                scheduled_date: b.scheduled_date,
                judge_score: b.judge_score,
                created_at: b.created_at,
              }))}
              organizationId={org.id}
              brandSlug={org.slug}
              brandName={org.display_name}
            />
          ),
        }}
      />

      <BackToTopFab />
    </main>
  );
}
