"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { inngest } from "@/inngest/client";

const SendBriefInput = z.object({
  organization_id: z.string().uuid(),
  brand_slug: z.string().min(1),
});

export async function sendBriefNow(raw: unknown) {
  const input = SendBriefInput.parse(raw);
  try {
    const result = await inngest.send({
      name: "morning-brief.tick",
      data: {
        organization_id: input.organization_id,
        run_window_start: new Date().toISOString(),
        call_preference: "markdown" as const,
      },
    });
    revalidatePath(`/demo/${input.brand_slug}`);
    return { ok: true, event_ids: result.ids };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    console.error("[sendBriefNow] inngest.send failed", reason);
    return { ok: false, reason };
  }
}
