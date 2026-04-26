"use client";

import { useState, useTransition } from "react";
import { formatRelative, truncate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { generateOnDemandDraft } from "@/app/actions/counter-draft";
import { SignalAiEvidence, type AiChat } from "./signal-ai-evidence";

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

export type SignalSourceType = "competitor" | "internal" | "external" | "peec_delta";

export type SourceMeta = {
  emoji: string;
  label: string;
  cls: string;
  tooltip: string;
};

export function sourceMeta(sourceType: string): SourceMeta {
  switch (sourceType) {
    case "peec_delta":
      return {
        emoji: "📊",
        label: "Peec",
        cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        tooltip: "Detected by Peec brand_report delta (visibility / sentiment / position shift)",
      };
    case "competitor":
    case "external":
      return {
        emoji: "🔍",
        label: "Tavily",
        cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
        tooltip: "Found via Tavily live web search of competitor moves",
      };
    default:
      return {
        emoji: "📁",
        label: "Internal",
        cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        tooltip: "Manual entry or seed data",
      };
  }
}

export function SignalCard({
  signal,
  brandName,
  organizationId,
  brandSlug,
  aiChats,
  aiChatsScope,
}: {
  signal: Signal;
  brandName: string;
  organizationId: string;
  brandSlug: string;
  aiChats?: AiChat[];
  aiChatsScope?: "prompt" | "brand";
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
    <li id={`signal-${signal.id}`} className="scroll-mt-24 rounded-md border border-border bg-background p-3">
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
          {(() => {
            const meta = sourceMeta(signal.source_type);
            return (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}
                title={meta.tooltip}
              >
                {meta.emoji} {meta.label}
              </span>
            );
          })()}
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
          {aiChats && aiChats.length > 0 ? (
            <SignalAiEvidence
              chats={aiChats}
              brandName={brandName}
              scope={aiChatsScope}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
