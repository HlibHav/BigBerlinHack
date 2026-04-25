"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { inngest } from "@/inngest/client";

const TriggerRadarInput = z.object({
  organization_id: z.string().uuid(),
  brand_slug: z.string().min(1),
  sweep_window_hours: z.number().int().positive().default(6),
});

export async function triggerRadar(raw: unknown) {
  const input = TriggerRadarInput.parse(raw);
  try {
    const result = await inngest.send({
      name: "competitor-radar.tick",
      data: {
        organization_id: input.organization_id,
        sweep_window_hours: input.sweep_window_hours,
      },
    });
    revalidatePath(`/demo/${input.brand_slug}`);
    return { ok: true, event_ids: result.ids };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    console.error("[triggerRadar] inngest.send failed", reason);
    return { ok: false, reason };
  }
}
