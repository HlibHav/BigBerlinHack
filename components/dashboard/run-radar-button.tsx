"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { triggerRadar } from "@/app/actions/radar";

export function RunRadarButton({
  organizationId,
  brandSlug,
}: {
  organizationId: string;
  brandSlug: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "running" | "ok" | "error">("idle");

  function onClick() {
    setStatus("running");
    startTransition(async () => {
      try {
        const result = await triggerRadar({
          organization_id: organizationId,
          brand_slug: brandSlug,
        });
        setStatus(result.ok ? "ok" : "error");
        // Server action revalidates path; user sees fresh data within 90s.
        setTimeout(() => setStatus("idle"), 8000);
      } catch (err) {
        console.error("triggerRadar failed", err);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 4000);
      }
    });
  }

  const label =
    status === "running"
      ? "Running…"
      : status === "ok"
      ? "✓ Triggered — refresh у ~90s"
      : status === "error"
      ? "✗ Failed"
      : "Run radar now";

  return (
    <Button
      size="sm"
      variant={status === "error" ? "destructive" : "default"}
      onClick={onClick}
      disabled={isPending || status === "running"}
    >
      {label}
    </Button>
  );
}
