import { formatRelative } from "@/lib/utils";
import type {
  PrelaunchBaseline,
  PrelaunchPanelResult,
  PrelaunchPhraseAvailability,
  PrelaunchVerdict,
} from "@/lib/schemas/prelaunch-check";

const verdictBadge: Record<PrelaunchVerdict, { className: string; emoji: string; label: string }> = {
  clear: {
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    emoji: "✓",
    label: "Clear",
  },
  caution: {
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    emoji: "⚠",
    label: "Caution",
  },
  clash: {
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    emoji: "✗",
    label: "Clash",
  },
};

const sentimentEmoji: Record<PrelaunchBaseline["sentiment"], string> = {
  positive: "🙂",
  neutral: "😐",
  negative: "🙁",
};

export type PrelaunchCheckRow = {
  id: string;
  draft_phrasing: string;
  category_hint: string | null;
  verdict: PrelaunchVerdict;
  verdict_reasoning: string;
  baseline: PrelaunchBaseline;
  phrase_availability: PrelaunchPhraseAvailability;
  llm_panel_results: PrelaunchPanelResult[];
  cost_usd_cents: number;
  evidence_refs: string[];
  created_at: string;
};

export function PrelaunchResultCard({ check }: { check: PrelaunchCheckRow }) {
  const badge = verdictBadge[check.verdict];

  const meanMention =
    check.llm_panel_results.length === 0
      ? 0
      : check.llm_panel_results.reduce((acc, p) => acc + p.mention_rate, 0) /
        check.llm_panel_results.length;

  return (
    <li className="rounded-md border border-border bg-background p-3 text-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${badge.className}`}
          >
            {badge.emoji} {badge.label}
          </span>
          {check.category_hint ? (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
              {check.category_hint}
            </span>
          ) : null}
          <span className="text-[10px] text-muted-foreground">
            ${(check.cost_usd_cents / 100).toFixed(2)}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {formatRelative(check.created_at)}
        </span>
      </header>

      <p className="mt-2 whitespace-pre-wrap rounded bg-muted/30 p-2 text-sm font-medium">
        “{check.draft_phrasing}”
      </p>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {check.verdict_reasoning}
      </p>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Breakdown · baseline + phrase + panel
        </summary>

        <div className="mt-2 space-y-2 rounded bg-muted/30 p-2 text-xs">
          <section>
            <p className="font-semibold text-muted-foreground">Peec baseline</p>
            <ul className="mt-1 grid grid-cols-3 gap-2">
              <li>
                <span className="text-[10px] uppercase text-muted-foreground">
                  visibility
                </span>
                <p className="font-medium">
                  {(check.baseline.visibility * 100).toFixed(1)}%
                </p>
              </li>
              <li>
                <span className="text-[10px] uppercase text-muted-foreground">
                  position
                </span>
                <p className="font-medium">
                  {check.baseline.position?.toFixed(2) ?? "—"}
                </p>
              </li>
              <li>
                <span className="text-[10px] uppercase text-muted-foreground">
                  sentiment
                </span>
                <p className="font-medium">
                  {sentimentEmoji[check.baseline.sentiment]} {check.baseline.sentiment}
                </p>
              </li>
            </ul>
          </section>

          <section>
            <p className="font-semibold text-muted-foreground">Phrase availability</p>
            {check.phrase_availability.taken ? (
              <div className="mt-1 space-y-1">
                <p>
                  ⚠ Used by:{" "}
                  <span className="font-medium">
                    {check.phrase_availability.by.join(", ")}
                  </span>
                </p>
                {check.phrase_availability.evidence_urls.length > 0 ? (
                  <ul className="space-y-0.5 pl-3">
                    {check.phrase_availability.evidence_urls.map((url, i) => (
                      <li key={i} className="break-all">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-foreground"
                        >
                          {url.replace(/^https?:\/\//, "").slice(0, 80)}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                ✓ No competitor clash detected
              </p>
            )}
          </section>

          <section>
            <p className="font-semibold text-muted-foreground">
              LLM panel ({check.llm_panel_results.length} prompts × 2 моделі) ·
              mean mention {(meanMention * 100).toFixed(0)}%
            </p>
            <ul className="mt-1 space-y-1">
              {check.llm_panel_results.map((p, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-baseline justify-between gap-1"
                >
                  <span className="line-clamp-1 min-w-0 flex-1 text-muted-foreground">
                    {p.prompt}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {sentimentEmoji[p.sentiment]} mention{" "}
                    {(p.mention_rate * 100).toFixed(0)}% · pos{" "}
                    {p.avg_position?.toFixed(1) ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </details>
    </li>
  );
}
