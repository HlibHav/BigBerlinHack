"use client";

import { useTransition } from "react";
import { toast } from "sonner";
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

  function onClick() {
    const t = toast.loading("Sending morning brief…", {
      description: "W6′ aggregating 24h signals + Peec pulse → Slack",
    });
    startTransition(async () => {
      try {
        const result = await sendBriefNow({
          organization_id: organizationId,
          brand_slug: brandSlug,
        });
        if (result.ok) {
          toast.success("Brief event sent", {
            id: t,
            description: "Check Slack #bbh-demo in ~30s",
          });
        } else {
          toast.error("Failed to send brief", {
            id: t,
            description: result.reason ?? "Inngest event API returned an error",
          });
        }
      } catch (err) {
        toast.error("Brief fail", {
          id: t,
          description: err instanceof Error ? err.message : "unknown",
        });
      }
    });
  }

  return (
    <Button size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? "Sending…" : "Send brief now"}
    </Button>
  );
}
