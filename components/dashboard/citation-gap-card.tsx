import type { CitationGap } from "@/lib/services/peec-snapshot";

/**
 * Citation gaps — URLs where competitors are cited but the own brand isn't.
 *
 * Data comes from `data/peec-snapshot.json → url_report[]` (Peec MCP
 * `get_url_report`). Each row reports `mentioned_brand_ids`; we filter out
 * URLs that already cite the own brand and rank the rest by `retrievals` —
 * how often AI engines pulled that URL into a response.
 *
 * High retrievals + missing own brand = priority earned-media targets. The
 * card surfaces top-5 with destination URL + competitor list as outreach hint.
 *
 * Server component — pure render, no client interactivity beyond the link.
 */
export function CitationGapCard({
  gaps,
  ownBrandName,
}: {
  gaps: CitationGap[];
  ownBrandName: string;
}) {
  if (gaps.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Citation gaps
        </h2>
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          ✓ No detected gaps in current snapshot — {ownBrandName} appears in every tracked source URL.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Citation gaps
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            URLs AI engines pull from that cite competitors but not {ownBrandName}. Outreach priority by retrieval volume.
          </p>
        </div>
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {gaps.length} gap{gaps.length === 1 ? "" : "s"}
        </span>
      </div>

      <ol className="mt-3 space-y-2">
        {gaps.slice(0, 5).map((g, i) => {
          const host = (() => {
            try {
              return new URL(g.url).hostname.replace(/^www\./, "");
            } catch {
              return g.url;
            }
          })();
          return (
            <li
              key={g.url}
              className="rounded-md border border-border bg-background p-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={g.title ?? g.url}>
                    {g.title ?? host}
                  </p>
                  <a
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    {host}
                  </a>
                </div>
                <span
                  className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  title="AI-engine retrievals (Peec)"
                >
                  {g.retrievals} retr
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/70">Cites:</span>{" "}
                {g.competitor_brand_names.join(" · ")}
                <span className="ml-1.5 font-medium text-red-700 dark:text-red-400">
                  · missing {ownBrandName}
                </span>
              </p>
              {i === 0 ? (
                <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Top priority — pitch inclusion or contribute insight to publisher
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
