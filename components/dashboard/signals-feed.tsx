"use client";

import { useState } from "react";
import { SignalCard } from "./signal-card";

type Signal = {
  id: string;
  severity: "low" | "med" | "high";
  sentiment: "positive" | "neutral" | "negative";
  position: number | null;
  summary: string;
  reasoning: string;
  source_type: "competitor" | "internal" | "external" | "peec_delta";
  source_url: string;
  evidence_refs: string[];
  auto_draft: boolean;
  competitor_id: string | null;
  created_at: string;
};

type Competitor = { id: string; display_name: string };

type Filter = "all" | "high" | "med" | "low";

const severityRank: Record<string, number> = { high: 0, med: 1, low: 2 };
const LOW_MED_VISIBLE_DEFAULT = 3;

export function SignalsFeed({
  signals,
  competitors,
  organizationId,
  brandSlug,
}: {
  signals: Signal[];
  competitors: Competitor[];
  organizationId: string;
  brandSlug: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [showAllLow, setShowAllLow] = useState(false);
  const competitorMap = new Map(competitors.map((c) => [c.id, c.display_name]));

  const sorted = [...signals].sort((a, b) => {
    const sevDiff = severityRank[a.severity] - severityRank[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const filtered = filter === "all" ? sorted : sorted.filter((s) => s.severity === filter);

  // У режимі "all" приховуємо med/low після 3 кожного — high завжди видні.
  const visible =
    filter === "all" && !showAllLow
      ? (() => {
          const high = filtered.filter((s) => s.severity === "high");
          const med = filtered.filter((s) => s.severity === "med").slice(0, LOW_MED_VISIBLE_DEFAULT);
          const low = filtered.filter((s) => s.severity === "low").slice(0, LOW_MED_VISIBLE_DEFAULT);
          return [...high, ...med, ...low];
        })()
      : filtered;
  const hiddenCount = filter === "all" && !showAllLow ? filtered.length - visible.length : 0;

  const counts = {
    all: signals.length,
    high: signals.filter((s) => s.severity === "high").length,
    med: signals.filter((s) => s.severity === "med").length,
    low: signals.filter((s) => s.severity === "low").length,
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Active signals (24h) — {signals.length}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "high", "med", "low"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-2.5 py-0.5 text-xs uppercase tracking-wide transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:opacity-80"
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {signals.length === 0
            ? "Жодного signal за останні 24h. Натисни «Run radar now» — W9 знайде competitor moves."
            : `Жодного ${filter} severity за фільтром.`}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {visible.map((s) => (
              <SignalCard
                key={s.id}
                signal={s}
                brandName={s.competitor_id ? competitorMap.get(s.competitor_id) ?? "—" : "—"}
                organizationId={organizationId}
                brandSlug={brandSlug}
              />
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <button
              onClick={() => setShowAllLow(true)}
              className="mt-3 w-full rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:bg-muted/40"
            >
              Show {hiddenCount} more med/low signals
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
