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
    const t = toast.loading("Radar запущено", {
      description: "W9 шукає competitor moves у Peec snapshot + Tavily",
    });
    startTransition(async () => {
      try {
        const result = await triggerRadar({
          organization_id: organizationId,
          brand_slug: brandSlug,
        });
        if (result.ok) {
          toast.success("Radar event надіслано", {
            id: t,
            description: "Pipeline крутиться у Inngest cloud, оновлення за ~60-90s",
          });
        } else {
          toast.error("Не вдалося тригернути radar", {
            id: t,
            description: result.reason ?? "Inngest event API повернув помилку",
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
