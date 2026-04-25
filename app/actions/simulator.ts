"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { inngest } from "@/inngest/client";

const TriggerSimulatorInput = z.object({
  organization_id: z.string().uuid(),
  brand_slug: z.string().min(1),
  seed_type: z.enum(["competitor-move", "user-prompt"]),
  seed_payload: z.record(z.unknown()),
  requested_by: z.string().uuid().nullable().default(null),
  num_variants: z.number().int().min(1).max(5).default(3),
});

export async function triggerSimulator(raw: unknown) {
  const input = TriggerSimulatorInput.parse(raw);
  try {
    const result = await inngest.send({
      name: "narrative.simulate-request",
      data: {
        organization_id: input.organization_id,
        seed_type: input.seed_type,
        seed_payload: input.seed_payload,
        requested_by: input.requested_by,
        num_variants: input.num_variants,
      },
    });
    revalidatePath(`/demo/${input.brand_slug}`);
    return { ok: true, event_ids: result.ids };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    console.error("[triggerSimulator] inngest.send failed", reason);
    return { ok: false, reason };
  }
}
