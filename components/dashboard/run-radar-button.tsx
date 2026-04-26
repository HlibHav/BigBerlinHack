"use client";

import { useTransition } from "react";
import { toast } from "sonner";
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

  function onClick() {
    const t = toast.loading("Radar started", {
      description: "W9 is scanning for competitor moves in Peec snapshot + Tavily",
    });
    startTransition(async () => {
      try {
        const result = await triggerRadar({
          organization_id: organizationId,
          brand_slug: brandSlug,
        });
        if (result.ok) {
          toast.success("Radar event sent", {
            id: t,
            description: "Pipeline running in Inngest cloud, updates in ~60-90s",
          });
        } else {
          toast.error("Failed to trigger radar", {
            id: t,
            description: result.reason ?? "Inngest event API returned an error",
          });
        }
      } catch (err) {
        toast.error("Radar fail", {
          id: t,
          description: err instanceof Error ? err.message : "unknown",
        });
      }
    });
  }

  return (
    <Button size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? "Triggering…" : "Run radar now"}
    </Button>
  );
}
