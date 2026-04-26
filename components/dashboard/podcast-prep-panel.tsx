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
          Generate retrieval-optimized brief для founder перед podcast
          appearance. Транскрипт публікується на 5-10 surfaces (Spotify, YouTube
          captions, Apple Podcasts, host site, aggregators) — всі crawl&apos;аються
          AI engines. Один podcast = 6-12 місяців visibility tail.
        </p>
      </header>

      <PodcastPrepForm organizationId={organizationId} />

      {briefs.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          Жодного brief&apos;у ще не згенеровано. Натисни{" "}
          <span className="font-semibold">+ New podcast brief</span> щоб
          створити перший.
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
