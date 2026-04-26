"use client";

import { useMemo, useState } from "react";
import { SignalCard } from "./signal-card";
import type { AiChat } from "./signal-ai-evidence";

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
const PAGE_SIZE = 8;

export function SignalsFeed({
  signals,
  competitors,
  organizationId,
  brandSlug,
  aiChats = [],
  ownBrandName,
}: {
  signals: Signal[];
  competitors: Competitor[];
  organizationId: string;
  brandSlug: string;
  aiChats?: AiChat[];
  ownBrandName: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [showAllLow, setShowAllLow] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const competitorMap = new Map(competitors.map((c) => [c.id, c.display_name]));

  // Pre-bucket chats by brand mentioned (case-insensitive). Each signal then
  // looks up either its competitor (if competitor_id is set) or own brand.
  const chatsByBrand = useMemo(() => {
    const map = new Map<string, AiChat[]>();
    for (const chat of aiChats) {
      for (const brand of chat.brands_mentioned) {
        const key = brand.toLowerCase();
        const arr = map.get(key) ?? [];
        arr.push(chat);
        map.set(key, arr);
      }
    }
    // Sort each bucket newest-first
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.date < b.date ? 1 : -1));
    }
    return map;
  }, [aiChats]);

  function chatsForSignal(s: Signal): AiChat[] {
    const targetBrand = s.competitor_id
      ? competitorMap.get(s.competitor_id) ?? ownBrandName
      : ownBrandName;
    return chatsByBrand.get(targetBrand.toLowerCase()) ?? [];
  }

  const sorted = [...signals].sort((a, b) => {
    const sevDiff = severityRank[a.severity] - severityRank[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const filtered = filter === "all" ? sorted : sorted.filter((s) => s.severity === filter);

  // In "all" mode hide med/low after 3 each — high signals are always visible.
  const preCapped =
    filter === "all" && !showAllLow
      ? (() => {
          const high = filtered.filter((s) => s.severity === "high");
          const med = filtered.filter((s) => s.severity === "med").slice(0, LOW_MED_VISIBLE_DEFAULT);
          const low = filtered.filter((s) => s.severity === "low").slice(0, LOW_MED_VISIBLE_DEFAULT);
          return [...high, ...med, ...low];
        })()
      : filtered;
  const visible = preCapped.slice(0, pageSize);
  const remaining = preCapped.length - visible.length;
  const hiddenCount = filter === "all" && !showAllLow ? filtered.length - preCapped.length : 0;

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
            ? "No signals in the last 24h. Click «Run radar now» — W9 will find competitor moves."
            : `No ${filter} severity matches the filter.`}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {visible.map((s) => (
              <SignalCard
                key={s.id}
                signal={s}
                brandName={
                  s.competitor_id ? competitorMap.get(s.competitor_id) ?? ownBrandName : ownBrandName
                }
                organizationId={organizationId}
                brandSlug={brandSlug}
                aiChats={chatsForSignal(s)}
              />
            ))}
          </ul>
          {remaining > 0 ? (
            <button
              onClick={() => setPageSize((s) => s + PAGE_SIZE)}
              className="mt-3 w-full rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:bg-muted/40"
            >
              Load {Math.min(remaining, PAGE_SIZE)} more
            </button>
          ) : hiddenCount > 0 ? (
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
