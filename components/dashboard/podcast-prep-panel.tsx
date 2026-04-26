import { PodcastPrepForm } from "./podcast-prep-form";
import {
  PodcastBriefCard,
  type PodcastBriefSummary,
} from "./podcast-brief-card";

interface Props {
  briefs: PodcastBriefSummary[];
  organizationId: string;
  brandSlug: string;
  brandName: string;
}

export function PodcastPrepPanel({
  briefs,
  organizationId,
  brandSlug,
  brandName,
}: Props) {
  return (
    <section className="space-y-3">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">Podcast prep · {brandName}</h2>
        <p className="text-xs text-muted-foreground">
          Generate a retrieval-optimized brief for the founder before a podcast
          appearance. Transcripts publish across 5-10 surfaces (Spotify, YouTube
          captions, Apple Podcasts, host site, aggregators) — all crawled by AI
          engines. One podcast = 6-12 months of visibility tail.
        </p>
      </header>

      <PodcastPrepForm organizationId={organizationId} />

      {briefs.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          No briefs generated yet. Click{" "}
          <span className="font-semibold">+ New podcast brief</span> to create
          your first one.
        </p>
      ) : (
        <ul className="space-y-2">
          {briefs.map((b) => (
            <li key={b.id}>
              <PodcastBriefCard brief={b} brandSlug={brandSlug} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
