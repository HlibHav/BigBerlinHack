"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerPrelaunchCheck } from "@/app/actions/prelaunch";

export function PrelaunchForm({
  organizationId,
  brandSlug,
}: {
  organizationId: string;
  brandSlug: string;
}) {
  const [phrasing, setPhrasing] = useState("");
  const [categoryHint, setCategoryHint] = useState("");
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);

  const tooShort = phrasing.trim().length < 10;
  const tooLong = phrasing.length > 2000;
  const disabled = tooShort || tooLong || isPending || running;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setRunning(true);
    const t = toast.loading("Pre-launch check started…", {
      description: "Peec baseline + Tavily phrase availability + LLM panel · ~60-90s",
    });
    startTransition(async () => {
      try {
        const result = await triggerPrelaunchCheck({
          organization_id: organizationId,
          brand_slug: brandSlug,
          draft_phrasing: phrasing.trim(),
          category_hint: categoryHint.trim() || undefined,
          requested_by: null,
        });
        if (result.ok) {
          toast.success("Check triggered", {
            id: t,
            description: "Verdict will appear in history in ~60s",
          });
          setPhrasing("");
          setCategoryHint("");
        } else {
          toast.error("Trigger fail", {
            id: t,
            description: result.reason ?? "Inngest send failed",
          });
        }
      } catch (err) {
        toast.error("Trigger fail", {
          id: t,
          description: err instanceof Error ? err.message : "unknown",
        });
      } finally {
        setRunning(false);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border border-border bg-background p-4"
    >
      <div>
        <label
          htmlFor="prelaunch-phrasing"
          className="mb-1 block text-sm font-medium"
        >
          Proposed phrasing for launch
        </label>
        <textarea
          id="prelaunch-phrasing"
          value={phrasing}
          onChange={(e) => setPhrasing(e.target.value)}
          placeholder="For example: AI-native CRM for startups that value speed"
          rows={4}
          maxLength={2000}
          className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>
            {tooShort
              ? "Minimum 10 characters"
              : tooLong
                ? "Maximum 2000 characters"
                : "10-2000 characters"}
          </span>
          <span>{phrasing.length} / 2000</span>
        </div>
      </div>

      <div>
        <label
          htmlFor="prelaunch-category"
          className="mb-1 block text-sm font-medium"
        >
          Category / context{" "}
          <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="prelaunch-category"
          value={categoryHint}
          onChange={(e) => setCategoryHint(e.target.value)}
          placeholder="e.g. B2B SaaS, modern CRM, vertical AI..."
          maxLength={200}
          className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          We&apos;ll check: whether the phrase is already taken by competitors and whether
          LLMs pick it up in their top ranking.
        </p>
        <Button type="submit" disabled={disabled}>
          {running ? "Running…" : "🚀 Run pre-launch check"}
        </Button>
      </div>

      {running ? (
        <div className="flex items-center gap-2 rounded bg-muted/40 p-2 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
          <span>
            Tavily search + LLM panel scoring · ~60-90s · result will appear in history
            below (UI auto-refreshes via Realtime)
          </span>
        </div>
      ) : null}
    </form>
  );
}
