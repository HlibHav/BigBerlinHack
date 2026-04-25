import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditPanel } from "@/components/dashboard/audit-panel";
import { CompetitorsPanel } from "@/components/dashboard/competitors-panel";
import { SignalsFeed } from "@/components/dashboard/signals-feed";
import { DraftsQueue } from "@/components/dashboard/drafts-queue";
import { SimulatorOutputs } from "@/components/dashboard/simulator-outputs";
import { MultiChannelPanel } from "@/components/dashboard/multi-channel-panel";
import { MorningBriefPanel } from "@/components/dashboard/morning-brief-panel";
import { V2Footer } from "@/components/dashboard/v2-footer";
import { PeecDataSourceBadge } from "@/components/dashboard/peec-data-source-badge";

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

  // Fan-out queries (parallel via Promise.all)
  const [
    { data: latestRun },
    { data: competitors },
    { data: signals },
    { data: drafts },
    { data: variants },
    { data: contentVariants },
    { data: brief },
  ] = await Promise.all([
    supabase
      .from("runs")
      .select("id, function_name, ok, stats, started_at, finished_at")
      .eq("organization_id", org.id)
      .eq("function_name", "competitor-radar")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {org.display_name}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              brand intelligence
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Що LLM сьогодні кажуть про {org.display_name}, які ходи роблять конкуренти, що відповісти.
          </p>
        </div>
        <PeecDataSourceBadge />
      </header>

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

      <V2Footer />
    </main>
  );
}
