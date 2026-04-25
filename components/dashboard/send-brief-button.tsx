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
    const t = toast.loading("Morning brief шлеться…", {
      description: "W6′ збирає 24h signals + Peec pulse → Slack",
    });
    startTransition(async () => {
      try {
        const result = await sendBriefNow({
          organization_id: organizationId,
          brand_slug: brandSlug,
        });
        if (result.ok) {
          toast.success("Brief event надіслано", {
            id: t,
            description: "Перевір Slack #bbh-demo за ~30s",
          });
        } else {
          toast.error("Не вдалося надіслати brief", {
            id: t,
            description: result.reason ?? "Inngest event API повернув помилку",
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
