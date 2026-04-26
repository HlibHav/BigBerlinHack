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
 * Server component — uses native `<details>` for expand/collapse so we keep
 * SSR (no client bundle cost) while letting analysts drill into per-URL
 * outreach context.
 */

/**
 * Outreach playbook keyed off URL hostname pattern. Hits the most likely
 * audience for each surface — competitor-owned domain, blog, listicle host,
 * forum/social, reference. Falls through to a generic suggestion.
 */
function outreachPlay(url: string): {
  audience: string;
  action: string;
} {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = url;
  }
  // Competitor-owned: pages on the competitor's own domain — direct outreach
  // doesn't apply. We can only hope to displace them via better SEO.
  if (
    host.endsWith(".com") &&
    /^(salesforce|hubspot|pipedrive|monday|zoho|attio)\./.test(host + ".")
  ) {
    return {
      audience: "Competitor-owned page — direct pitch is futile.",
      action:
        "Out-rank with a comparable comparison page on attio.com (LISTICLE/COMPARISON). Cross-link from existing content + submit to indexing tools.",
    };
  }
  if (/(reddit|quora|stackoverflow|hackernews|news\.ycombinator)\./.test(host)) {
    return {
      audience: "Forum / Q&A — UGC layer.",
      action:
        "Find the active thread, contribute a substantive reply that mentions Attio with concrete differentiator. Avoid promotional tone. Founder-attributed answers ranks best.",
    };
  }
  if (/(youtube|youtu\.be)/.test(host)) {
    return {
      audience: "YouTube — UGC video transcripts.",
      action:
        "Reach out to the creator with sponsorship or guest pitch. Failing that, leave a long-form comment with concrete value — pinned/top comments get pulled into AI summaries.",
    };
  }
  if (/(g2|capterra|getapp|trustradius|softwareadvice)\./.test(host)) {
    return {
      audience: "Review aggregator — REFERENCE layer.",
      action:
        "Confirm Attio profile is claimed and complete. Solicit recent reviews from happy customers (G2 weights recency). Add comparison content vs the cited competitor.",
    };
  }
  if (/(wikipedia|wiki)\./.test(host)) {
    return {
      audience: "Wikipedia — REFERENCE layer.",
      action:
        "Add a neutral, well-sourced mention to relevant entries (CRM software, Customer Relationship Management). Cite primary research or third-party coverage, not Attio.com.",
    };
  }
  if (/(pcmag|techradar|tomsguide|zapier|forbes|inc\.com|fastcompany|cnet)\./.test(host)) {
    return {
      audience: "Tier-1 editorial publication.",
      action:
        "Email the listicle author / editor with a 3-sentence pitch: distinct angle vs the cited competitor, customer proof point, optional founder quote. Include high-res logo + 2-line product description for inclusion.",
    };
  }
  return {
    audience: "Editorial / blog publisher.",
    action:
      "Email the author or editorial team with a value-add — comparison data, customer story, or expert quote. Offer to provide a screenshot + 50-word description for inclusion in a future update.",
  };
}

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
            URLs AI engines pull from that cite competitors but not {ownBrandName}. Click a row for outreach playbook.
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
          const play = outreachPlay(g.url);
          return (
            <li key={g.url}>
              <details className="group rounded-md border border-border bg-background p-3 open:border-amber-300 dark:open:border-amber-800">
                <summary className="flex cursor-pointer flex-col gap-1 list-none">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span
                        aria-hidden
                        className="text-xs text-muted-foreground transition-transform group-open:rotate-90"
                      >
                        ▸
                      </span>
                      <p
                        className="truncate text-sm font-medium"
                        title={g.title ?? g.url}
                      >
                        {g.title ?? host}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      title="AI-engine retrievals (Peec)"
                    >
                      {g.retrievals} retr
                    </span>
                  </div>
                  <p className="ml-5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground/70">Cites:</span>{" "}
                    {g.competitor_brand_names.join(" · ")}
                    <span className="ml-1.5 font-medium text-red-700 dark:text-red-400">
                      · missing {ownBrandName}
                    </span>
                    {i === 0 ? (
                      <span className="ml-1.5 rounded bg-amber-100 px-1 text-[9px] uppercase tracking-wider text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        top priority
                      </span>
                    ) : null}
                  </p>
                </summary>

                <div className="mt-3 ml-5 space-y-3 border-l-2 border-amber-200 pl-3 text-xs dark:border-amber-900/60">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Retrievals
                      </dt>
                      <dd className="font-mono text-sm font-semibold">
                        {g.retrievals}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Citations
                      </dt>
                      <dd className="font-mono text-sm font-semibold">
                        {g.citation_count}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Cites
                      </dt>
                      <dd className="font-medium">
                        {g.competitor_brand_names.length}{" "}
                        competitor{g.competitor_brand_names.length === 1 ? "" : "s"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Source
                      </dt>
                      <dd>
                        <a
                          href={g.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[11px] underline-offset-2 hover:underline"
                        >
                          {host} ↗
                        </a>
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Audience
                    </p>
                    <p className="mt-0.5 leading-snug">{play.audience}</p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Outreach action
                    </p>
                    <p className="mt-0.5 leading-snug">{play.action}</p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Why this matters
                    </p>
                    <p className="mt-0.5 leading-snug text-muted-foreground">
                      AI engines pulled this URL into responses{" "}
                      <span className="font-medium text-foreground">{g.retrievals}</span>{" "}
                      times. Every retrieval that cites a competitor without{" "}
                      {ownBrandName} compounds the gap — buyers asking the same
                      query get a list that excludes you. Closing this URL
                      shifts share of voice without paying for ads.
                    </p>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
