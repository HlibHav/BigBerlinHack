"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendBriefNow } from "@/app/actions/morning-brief";

export function SendBriefButton({
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
        const result = await sendBriefNow({
          organization_id: organizationId,
          brand_slug: brandSlug,
        });
        setStatus(result.ok ? "ok" : "error");
        setTimeout(() => setStatus("idle"), 8000);
      } catch (err) {
        console.error("sendBriefNow failed", err);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 4000);
      }
    });
  }

  const label =
    status === "running"
      ? "Sending…"
      : status === "ok"
      ? "✓ Triggered — check Slack"
      : status === "error"
      ? "✗ Failed"
      : "Send brief now";

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
