"use client";

import { useState, useTransition } from "react";
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

const statusColor: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  published: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

export function DraftCard({
  draft,
  variants,
  organizationId,
  brandSlug,
  decided,
}: {
  draft: Draft;
  variants: ContentVariant[];
  organizationId: string;
  brandSlug: string;
  decided?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState(draft.status);
  const [showVariants, setShowVariants] = useState(false);

  function onReview(status: "approved" | "rejected") {
    setOptimisticStatus(status);
    startTransition(async () => {
      try {
        await reviewCounterDraft({
          draft_id: draft.id,
          organization_id: organizationId,
          brand_slug: brandSlug,
          status,
        });
      } catch (err) {
        console.error("reviewCounterDraft failed", err);
        setOptimisticStatus(draft.status);
      }
    });
  }

  function onCopy() {
    navigator.clipboard.writeText(draft.body).catch(console.error);
  }

  function onSimulate() {
    startTransition(async () => {
      try {
        await triggerSimulator({
          organization_id: organizationId,
          brand_slug: brandSlug,
          seed_type: "competitor-move",
          seed_payload: { counter_draft_id: draft.id, signal_id: draft.signal_id },
          requested_by: null,
          num_variants: 3,
        });
      } catch (err) {
        console.error("triggerSimulator failed", err);
      }
    });
  }

  return (
    <li className={`rounded-md border border-border bg-background p-3 ${decided ? "opacity-70" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusColor[optimisticStatus]}`}>
            {optimisticStatus}
          </span>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
            {draft.channel_hint}
          </span>
          <span className="text-xs text-muted-foreground">tone: {draft.tone_pillar}</span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(draft.created_at)}</span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm">{draft.body}</p>

      {!decided && optimisticStatus === "draft" ? (
        <div className="mt-3 flex flex-wrap gap-2">
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
    </li>
  );
}
