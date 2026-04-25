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
  const competitorMap = new Map(competitors.map((c) => [c.id, c.display_name]));

  const filtered = filter === "all" ? signals : signals.filter((s) => s.severity === filter);

  const counts = {
    all: signals.length,
    high: signals.filter((s) => s.severity === "high").length,
    med: signals.filter((s) => s.severity === "med").length,
    low: signals.filter((s) => s.severity === "low").length,
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Active signals (24h) — {signals.length}
        </h2>
        <div className="flex gap-1.5">
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
            ? "Жодного signal за останні 24h. Тригни radar."
            : `Жодного ${filter} severity за фільтром.`}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {filtered.map((s) => (
            <SignalCard
              key={s.id}
              signal={s}
              brandName={s.competitor_id ? competitorMap.get(s.competitor_id) ?? "—" : "—"}
              organizationId={organizationId}
              brandSlug={brandSlug}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
