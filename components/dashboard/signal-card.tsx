"use client";

import { useState, useTransition } from "react";
import { formatRelative, truncate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { generateOnDemandDraft } from "@/app/actions/counter-draft";

type Signal = {
  id: string;
  severity: "low" | "med" | "high";
  sentiment: "positive" | "neutral" | "negative";
  position: number | null;
  summary: string;
  reasoning: string;
  source_type: string;
  source_url: string;
  evidence_refs: string[];
  auto_draft: boolean;
  created_at: string;
};

const severityColor: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  med: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const sentimentEmoji: Record<string, string> = {
  positive: "🙂",
  neutral: "😐",
  negative: "🙁",
};

export function SignalCard({
  signal,
  brandName,
  organizationId,
  brandSlug,
}: {
  signal: Signal;
  brandName: string;
  organizationId: string;
  brandSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [drafted, setDrafted] = useState(false);

  function onGenerate() {
    startTransition(async () => {
      try {
        await generateOnDemandDraft({
          signal_id: signal.id,
          organization_id: organizationId,
          brand_slug: brandSlug,
        });
        setDrafted(true);
      } catch (err) {
        console.error("generateOnDemandDraft failed", err);
      }
    });
  }

  return (
    <li className="rounded-md border border-border bg-background p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${severityColor[signal.severity]}`}>
            {signal.severity}
          </span>
          <span className="text-sm" title={`sentiment: ${signal.sentiment}`}>
            {sentimentEmoji[signal.sentiment]}
          </span>
          {signal.position !== null ? (
            <span className="text-xs text-muted-foreground" title="avg LLM list position (Peec)">
              pos {signal.position.toFixed(1)}
            </span>
          ) : null}
          <span className="text-xs font-medium">{brandName}</span>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
            {signal.source_type === "peec_delta" ? "Peec" : signal.source_type}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatRelative(signal.created_at)}
        </span>
      </div>

      <p className="mt-2 text-sm">{truncate(signal.summary, 200)}</p>

      <div className="mt-2 flex items-center gap-2">
        <button
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide details" : "Show evidence"}
        </button>
        {signal.severity === "med" && !signal.auto_draft && !drafted ? (
          <Button size="sm" variant="outline" onClick={onGenerate} disabled={isPending}>
            {isPending ? "Triggering…" : "Generate counter-draft"}
          </Button>
        ) : null}
        {drafted ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">✓ Triggered</span>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 rounded bg-muted/50 p-2 text-xs space-y-2">
          <p>
            <strong>Reasoning:</strong> {signal.reasoning}
          </p>
          <p>
            <strong>Sources:</strong>{" "}
            {signal.evidence_refs.map((ref, i) => (
              <span key={i}>
                {ref.startsWith("http") ? (
                  <a href={ref} target="_blank" rel="noopener noreferrer" className="underline">
                    {ref.replace(/^https?:\/\//, "").slice(0, 50)}
                  </a>
                ) : (
                  <span className="font-mono">{ref}</span>
                )}
                {i < signal.evidence_refs.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </li>
  );
}
