import { notFound } from "next/navigation";

import { PodcastBriefDetail } from "@/components/dashboard/podcast-brief-detail";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PodcastBriefPage({
  params,
}: {
  params: { brand: string; id: string };
}) {
  const supabase = createServiceClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, slug, display_name, is_public_demo")
    .eq("slug", params.brand)
    .maybeSingle();

  if (!org || !org.is_public_demo) {
    notFound();
  }

  const { data: brief } = await supabase
    .from("podcast_briefs")
    .select(
      "id, podcast_name, host_name, audience, episode_topic, scheduled_date, judge_score, judge_reasoning, judge_dimensions, top_fixes, talking_points, anticipated_qa, brand_drop_moments, topics_to_avoid, competitor_mention_strategy, markdown_brief, created_at",
    )
    .eq("organization_id", org.id)
    .eq("id", params.id)
    .maybeSingle();

  if (!brief) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PodcastBriefDetail brief={brief} brandSlug={org.slug} />
    </main>
  );
}
