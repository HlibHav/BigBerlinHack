"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import { inngest } from "@/inngest/client";
import { PrelaunchCheckInputSchema } from "@/lib/schemas/prelaunch-check";

/**
 * Trigger a pre-launch check. Validates user input via Zod, generates a
 * client-visible check_id (UUID v4), emits `prelaunch.check-request` event
 * — Inngest pipeline picks it up і ~60s later інсертить row у prelaunch_checks
 * table. UI підписана на Realtime → toast + auto-refresh.
 */
export async function triggerPrelaunchCheck(raw: unknown) {
  const parsed = PrelaunchCheckInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      reason: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const input = parsed.data;
  const checkId = randomUUID();

  try {
    await inngest.send({
      name: "prelaunch.check-request",
      data: { ...input, check_id: checkId },
    });
  } catch (err) {
    return {
      ok: false as const,
      reason: err instanceof Error ? err.message : "inngest.send failed",
    };
  }

  revalidatePath(`/demo/${input.brand_slug}`);
  return { ok: true as const, check_id: checkId };
}
