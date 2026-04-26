"use client";

import { useMemo, useState } from "react";
import type { PeecAction } from "@/lib/schemas/peec-snapshot";

type Scope = "owned" | "editorial" | "reference" | "ugc";

const SCOPE_META: Record<Scope, { label: string; emoji: string; tooltip: string }> = {
  owned: {
    label: "Owned",
    emoji: "🏠",
    tooltip: "Improvements on your own domain — content gaps Peec detected on attio.com.",
  },
  editorial: {
    label: "Editorial",
    emoji: "📰",
    tooltip: "Earned-media targets — publications AI engines cite that you can pitch.",
  },
  reference: {
    label: "Reference",
    emoji: "📚",
    tooltip: "Wikipedia / G2 / authoritative sources AI engines retrieve from.",
  },
  ugc: {
    label: "UGC",
    emoji: "💬",
    tooltip: "User-generated surfaces — Reddit, YouTube, forums AI engines pull from.",
  },
};

function scoreBadgeColor(score: number): string {
  if (score >= 0.3) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  if (score >= 0.05) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

/**
 * Surfaces Peec's per-scope opportunity actions as four tabs.
 *
 * Data is sourced from `data/peec-snapshot.json → actions[]`, which Peec MCP's
 * `get_actions` tool populates per-scope (owned / editorial / reference / ugc),
 * sorted by `opportunity_score`. We render the top N actions per scope and let
 * the user switch tabs.
 *
 * Why client component: tab state is local (no URL persistence needed — it's a
 * narrow UI affordance, not a shared route).
 */
export function PeecActionsPanel({ actions }: { actions: PeecAction[] }) {
  const [scope, setScope] = useState<Scope>("editorial");

  const byScope = useMemo(() => {
    const map: Record<Scope, PeecAction[]> = {
      owned: [],
      editorial: [],
      reference: [],
      ugc: [],
    };
    for (const a of actions) map[a.group_type].push(a);
    for (const k of Object.keys(map) as Scope[]) {
      map[k].sort((x, y) => y.opportunity_score - x.opportunity_score);
    }
    return map;
  }, [actions]);

  const totalCount = actions.length;
  const current = byScope[scope] ?? [];

  if (totalCount === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card/50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Peec recommendations
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No actions in current snapshot. Refresh peec-snapshot.json via MCP to populate.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            What Peec recommends
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Per-surface opportunity actions ranked by Peec — prioritize where retrieval volume is captured.
          </p>
        </div>
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {totalCount} action{totalCount === 1 ? "" : "s"}
        </span>
      </div>

      <ul role="tablist" className="mt-3 flex flex-wrap gap-1.5">
        {(Object.keys(SCOPE_META) as Scope[]).map((key) => {
          const meta = SCOPE_META[key];
          const count = byScope[key].length;
          const active = scope === key;
          return (
            <li key={key} role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setScope(key)}
                disabled={count === 0}
                title={meta.tooltip}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : count === 0
                    ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                    : "bg-secondary text-secondary-foreground hover:opacity-80"
                }`}
              >
                <span className="mr-1" aria-hidden>
                  {meta.emoji}
                </span>
                {meta.label}
                <span className="ml-1.5 text-[10px] opacity-70">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {current.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No actions in this surface. {SCOPE_META[scope].tooltip}
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {current.slice(0, 5).map((action, i) => (
            <li
              key={`${scope}-${i}`}
              className="flex items-start gap-3 rounded-md border border-border bg-background p-3"
            >
              <span className="mt-0.5 text-xs font-mono text-muted-foreground">
                {i + 1}.
              </span>
              <div className="flex-1">
                <p className="text-sm leading-relaxed">{action.text}</p>
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${scoreBadgeColor(
                  action.opportunity_score,
                )}`}
                title={`Opportunity score (Peec): ${action.opportunity_score.toFixed(3)}`}
              >
                {(action.opportunity_score * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ol>
      )}

      {current.length > 5 ? (
        <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Showing top 5 of {current.length} — refresh snapshot for the latest mix.
        </p>
      ) : null}
    </section>
  );
}
