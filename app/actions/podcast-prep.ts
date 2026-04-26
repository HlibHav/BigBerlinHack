"use server";

import { revalidatePath } from "next/cache";

import { inngest } from "@/inngest/client";
import { PodcastPrepRequestSchema } from "@/lib/schemas/podcast-brief";

/**
 * Server action — fired from `<PodcastPrepForm>` on `/podcast-prep`.
 *
 * Validates input through PodcastPrepRequestSchema (CRITICAL — duplicates
 * client-side validation as defense-in-depth per Gate A), emits the Inngest
 * event, then revalidates the brief list page so the new entry appears
 * once the pipeline persists it.
 */
export async function triggerPodcastPrep(raw: unknown) {
  const input = PodcastPrepRequestSchema.parse(raw);
  try {
    const result = await inngest.send({
      name: "podcast.prep-request",
      data: input,
    });
    revalidatePath("/podcast-prep");
    return { ok: true as const, event_ids: result.ids };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    console.error("[triggerPodcastPrep] inngest.send failed", reason);
    return { ok: false as const, reason };
  }
}
