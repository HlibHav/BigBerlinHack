import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditPanel } from "@/components/dashboard/audit-panel";
import { CompetitorsPanel } from "@/components/dashboard/competitors-panel";
import { SignalsFeed } from "@/components/dashboard/signals-feed";
import { DraftsQueue } from "@/components/dashboard/drafts-queue";
import { SimulatorOutputs } from "@/components/dashboard/simulator-outputs";
import { MultiChannelPanel } from "@/components/dashboard/multi-channel-panel";
import { MorningBriefPanel } from "@/components/dashboard/morning-brief-panel";
import { CostPanel } from "@/components/dashboard/cost-panel";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";
import { BrandHealthHero } from "@/components/dashboard/brand-health-hero";
import { RealtimeRefresher } from "@/components/dashboard/realtime-refresher";
import { V2Footer } from "@/components/dashboard/v2-footer";
import { PeecDataSourceBadge } from "@/components/dashboard/peec-data-source-badge";
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

  // Cost ledger query potentially missing у generated types (cast handled у CostPanel side).
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
      .in("status", ["draft", "approved", "rejected"])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("narrative_variants")
      .select(
        "id, simulator_run_id, rank, body, score, score_reasoning, predicted_sentiment, avg_position, mention_rate, evidence_refs, created_at"
      )
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .order("rank", { ascending: true })
      .limit(15),
    supabase
      .from("content_variants")
      .select("id, parent_counter_draft_id, channel, title, body, metadata, status, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("brief_deliveries")
      .select("id, delivery_date, channel, recipient, status, summary_body, sent_at, error_reason, created_at")
      .eq("organization_id", org.id)
      .order("delivery_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // cost_ledger may not exist у generated types yet — cast through any
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
  ]);

  // Brand health: 7-day Peec history для self brand. Snapshot bundled у serverless.
  let healthHistory: Array<{
    date: string;
    visibility: number;
    share_of_voice: number;
    sentiment: "positive" | "neutral" | "negative";
    position: number | null;
  }> = [];
  try {
    const snapshot = await loadPeecSnapshot();
    healthHistory = getBrandReportHistory(snapshot, org.display_name, 7).map((r) => ({
      date: r.date,
      visibility: r.visibility,
      share_of_voice: r.share_of_voice,
      sentiment: r.sentiment,
      position: r.position,
    }));
  } catch {
    // peec-snapshot read failure — render empty state у hero
  }

  // Latest run per function — для PipelineStatus + AuditPanel
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
            Що LLM сьогодні кажуть про {org.display_name}, які ходи роблять конкуренти, що відповісти.
          </p>
        </div>
        <PeecDataSourceBadge />
      </header>

      <BrandHealthHero history={healthHistory} brandName={org.display_name} />

      <PipelineStatus runs={pipelineRuns} />

      <AuditPanel
        organizationId={org.id}
        brandSlug={org.slug}
        latestRun={latestRun}
      />

      <CompetitorsPanel competitors={competitors ?? []} />

      <SignalsFeed
        signals={signals ?? []}
        competitors={competitors ?? []}
        organizationId={org.id}
        brandSlug={org.slug}
      />

      <DraftsQueue
        drafts={drafts ?? []}
        contentVariants={contentVariants ?? []}
        organizationId={org.id}
        brandSlug={org.slug}
      />

      <SimulatorOutputs variants={variants ?? []} />

      <MultiChannelPanel contentVariants={contentVariants ?? []} drafts={drafts ?? []} />

      <MorningBriefPanel
        latestBrief={brief}
        organizationId={org.id}
        brandSlug={org.slug}
      />

      <CostPanel rows={costRows ?? []} />

      <V2Footer />
    </main>
  );
}
