"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { reviewCounterDraft } from "@/app/actions/counter-draft";
import { triggerSimulator } from "@/app/actions/simulator";

type Draft = {
  id: string;
  signal_id: string | null;
  status: "draft" | "approved" | "rejected" | "published";
  body: string;
  channel_hint: "x" | "linkedin" | "blog" | "multi";
  tone_pillar: string;
  reasoning: string;
  evidence_refs: string[];
  created_at: string;
};

type ContentVariant = {
  id: string;
  channel: "blog" | "x_thread" | "linkedin" | "email";
  title: string | null;
  body: string;
};

type Signal = {
  id: string;
  severity: "low" | "med" | "high";
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
  source_type: "competitor" | "internal" | "external" | "peec_delta";
};

type NarrativeVariant = {
  id: string;
  rank: number;
  body: string;
  score: number;
  predicted_sentiment: "positive" | "neutral" | "negative";
  avg_position: number | null;
  mention_rate: number;
};

const severityChip: Record<Signal["severity"], string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  med: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const sentimentEmoji: Record<NarrativeVariant["predicted_sentiment"], string> = {
  positive: "🙂",
  neutral: "😐",
  negative: "🙁",
};

const statusColor: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  published: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

function DraftStepper({
  status,
  variantsCount,
}: {
  status: "draft" | "approved" | "rejected" | "published";
  variantsCount: number;
}) {
  // Stage states: 0 done, 1 active, 2 pending, 3 skipped
  const isRejected = status === "rejected";
  const stages: Array<{ label: string; state: 0 | 1 | 2 | 3 }> = [
    { label: "Signal", state: 0 },
    { label: "Draft", state: 0 },
    {
      label: "Approve",
      state: isRejected ? 3 : status === "draft" ? 1 : 0,
    },
    {
      label: "Expand",
      state: isRejected ? 3 : variantsCount === 0 ? (status === "approved" ? 1 : 2) : 0,
    },
    {
      label: "Publish",
      state: isRejected ? 3 : status === "published" ? 0 : variantsCount > 0 ? 1 : 2,
    },
  ];

  const stateClass = (s: 0 | 1 | 2 | 3): string => {
    if (s === 0) return "bg-emerald-500 text-white";
    if (s === 1) return "bg-primary text-primary-foreground ring-2 ring-primary/30";
    if (s === 3) return "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 line-through";
    return "bg-secondary text-muted-foreground";
  };

  return (
    <ol className="mt-2 flex items-center gap-1 overflow-x-auto text-[10px] uppercase tracking-wider">
      {stages.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1">
          <span
            className={`flex h-5 items-center rounded-full px-2 ${stateClass(s.state)}`}
          >
            {s.state === 0 ? "✓" : s.state === 3 ? "✗" : i + 1} <span className="ml-1">{s.label}</span>
          </span>
          {i < stages.length - 1 ? (
            <span className="h-px w-3 shrink-0 bg-border" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function DraftCard({
  draft,
  variants,
  signal,
  narrativeVariants,
  organizationId,
  brandSlug,
  decided,
}: {
  draft: Draft;
  variants: ContentVariant[];
  signal: Signal | null;
  narrativeVariants: NarrativeVariant[];
  organizationId: string;
  brandSlug: string;
  decided?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState(draft.status);
  const [showVariants, setShowVariants] = useState(false);
  // Compact mode default: collapsed everything except meta + CTA. Click chevron — full layout.
  const [expanded, setExpanded] = useState(false);

  function onReview(status: "approved" | "rejected") {
    setOptimisticStatus(status);
    const t =
      status === "approved"
        ? toast.loading("Approve → expanding draft", {
            description: "W7 будує 4 channel variants (blog/X/LinkedIn/email)",
          })
        : toast.loading("Rejecting draft");
    startTransition(async () => {
      try {
        const result = await reviewCounterDraft({
          draft_id: draft.id,
          organization_id: organizationId,
          brand_slug: brandSlug,
          status,
        });
        if (result.ok) {
          toast.success(status === "approved" ? "Draft approved → expansion triggered" : "Draft rejected", {
            id: t,
            description: status === "approved" ? "Variants з'являться у ~90s" : undefined,
          });
        } else {
          toast.error("Review fail", {
            id: t,
            description: result.reason ?? "DB update failed",
          });
          setOptimisticStatus(draft.status);
        }
      } catch (err) {
        toast.error("Review fail", {
          id: t,
          description: err instanceof Error ? err.message : "unknown",
        });
        setOptimisticStatus(draft.status);
      }
    });
  }

  function onCopy() {
    navigator.clipboard
      .writeText(draft.body)
      .then(() => toast.success("Скопійовано у буфер"))
      .catch((err) => toast.error("Не вдалося скопіювати", { description: String(err) }));
  }

  function onSimulate() {
    const t = toast.loading("Simulating alternatives", {
      description: "W5 ranking 3 variants по mention rate × position × sentiment",
    });
    startTransition(async () => {
      try {
        const result = await triggerSimulator({
          organization_id: organizationId,
          brand_slug: brandSlug,
          seed_type: "competitor-move",
          seed_payload: { counter_draft_id: draft.id, signal_id: draft.signal_id },
          requested_by: null,
          num_variants: 3,
        });
        if (result.ok) {
          toast.success("Simulator triggered", {
            id: t,
            description: "Variants з'являться у Simulator outputs за ~60s",
          });
        } else {
          toast.error("Simulator fail", { id: t, description: result.reason ?? "event API error" });
        }
      } catch (err) {
        toast.error("Simulator fail", {
          id: t,
          description: err instanceof Error ? err.message : "unknown",
        });
      }
    });
  }

  return (
    <li className={`rounded-md border border-border bg-background p-3 ${decided ? "opacity-70" : ""}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`draft-body-${draft.id}`}
        className="-m-1 flex w-full items-baseline justify-between gap-3 rounded p-1 text-left hover:bg-muted/30"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden className="text-xs text-muted-foreground">
            {expanded ? "▾" : "▸"}
          </span>
          {signal ? (
            <span
              title={`signal severity: ${signal.severity}`}
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                signal.severity === "high"
                  ? "bg-red-500"
                  : signal.severity === "med"
                  ? "bg-amber-500"
                  : "bg-zinc-400"
              }`}
            />
          ) : null}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusColor[optimisticStatus]}`}
          >
            {optimisticStatus}
          </span>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
            {draft.channel_hint}
          </span>
          {!expanded ? (
            <span className="line-clamp-1 min-w-0 text-xs text-muted-foreground">
              {draft.body.slice(0, 120)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">tone: {draft.tone_pillar}</span>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatRelative(draft.created_at)}
        </span>
      </button>

      {!expanded ? null : (
        <div id={`draft-body-${draft.id}`}>
          {signal ? (
            <a
              href={`?tab=signals#signal-${signal.id}`}
              className="mt-2 block rounded-md border border-border bg-muted/30 p-2 text-xs hover:bg-muted/50 transition-colors"
              title="View signal у Signals tab"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  triggered by
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${severityChip[signal.severity]}`}
                >
                  {signal.severity}
                </span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase text-secondary-foreground">
                  {signal.source_type === "peec_delta" ? "Peec" : signal.source_type}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground hover:underline">
                  view in feed ↗
                </span>
              </div>
              <p className="mt-1 line-clamp-2">{signal.summary}</p>
            </a>
          ) : null}

          <DraftStepper status={optimisticStatus} variantsCount={variants.length} />

          <p className="mt-2 whitespace-pre-wrap text-sm">{draft.body}</p>

      {draft.evidence_refs.length > 0 ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:underline">
            Evidence ({draft.evidence_refs.length})
          </summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {draft.evidence_refs.map((ref, i) => (
              <li key={i} className="break-all">
                {ref.startsWith("http") ? (
                  <a href={ref} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                    {ref.replace(/^https?:\/\//, "").slice(0, 80)}
                  </a>
                ) : (
                  <span className="font-mono text-muted-foreground">{ref}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!decided && optimisticStatus === "draft" ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button size="sm" onClick={() => onReview("approved")} disabled={isPending}>
            ✓ Approve → Expand
          </Button>
          <Button size="sm" variant="outline" onClick={() => onReview("rejected")} disabled={isPending}>
            ✗ Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={onCopy}>
            ⧉ Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={onSimulate} disabled={isPending}>
            ↻ Simulate alternatives
          </Button>
        </div>
      ) : null}

      {narrativeVariants.length > 0 ? (
        <details className="mt-3 rounded-md border border-border bg-muted/30 p-2 text-xs" open>
          <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">
            ↻ {narrativeVariants.length} simulator variants for this draft
          </summary>
          <ol className="mt-2 space-y-2">
            {narrativeVariants
              .slice()
              .sort((a, b) => a.rank - b.rank)
              .map((v) => (
                <li key={v.id} className="rounded bg-background p-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        #{v.rank}
                      </span>
                      <span className="font-medium">score {v.score.toFixed(2)}</span>
                      <span title={`predicted sentiment: ${v.predicted_sentiment}`}>
                        {sentimentEmoji[v.predicted_sentiment]}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      mention {(v.mention_rate * 100).toFixed(0)}% · pos{" "}
                      {v.avg_position !== null ? v.avg_position.toFixed(1) : "—"}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs">{v.body}</p>
                </li>
              ))}
          </ol>
        </details>
      ) : null}

      {variants.length > 0 ? (
        <div className="mt-3">
          <button
            onClick={() => setShowVariants((v) => !v)}
            className="text-xs text-muted-foreground hover:underline"
          >
            {showVariants ? "Hide" : "Show"} {variants.length} channel variants
          </button>
          {showVariants ? (
            <ul className="mt-2 space-y-2">
              {variants.map((v) => (
                <li key={v.id} className="rounded bg-muted/40 p-2 text-xs">
                  <p className="font-semibold uppercase">{v.channel}</p>
                  {v.title ? <p className="mt-0.5 font-medium">{v.title}</p> : null}
                  <p className="mt-0.5 whitespace-pre-wrap">{v.body.slice(0, 280)}{v.body.length > 280 ? "…" : ""}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
        </div>
      )}
    </li>
  );
}
