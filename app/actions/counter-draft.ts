"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

const ReviewCounterDraftInput = z.object({
  draft_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  brand_slug: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
});

/**
 * Review a counter-draft (approve / reject).
 * On approve: emit `content.expand-request` to trigger W7 multi-channel expansion.
 */
export async function reviewCounterDraft(raw: unknown) {
  const input = ReviewCounterDraftInput.parse(raw);

  const supabase = createServiceClient();

  const { error } = await supabase
    .from("counter_drafts")
    .update({
      status: input.status,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.draft_id)
    .eq("organization_id", input.organization_id);

  if (error) {
    return { ok: false, reason: error.message };
  }

  if (input.status === "approved") {
    try {
      await inngest.send({
        name: "content.expand-request",
        data: {
          organization_id: input.organization_id,
          parent_counter_draft_id: input.draft_id,
        },
      });
    } catch (err) {
      console.error("[reviewCounterDraft] inngest.send failed", err);
      // Status update succeeded; skip event if Inngest unavailable. UI already shows approved.
    }
  }

  revalidatePath(`/demo/${input.brand_slug}`);
  return { ok: true };
}

const GenerateOnDemandInput = z.object({
  signal_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  brand_slug: z.string().min(1),
});

/**
 * Generate on-demand counter-draft for a medium signal.
 * Hackathon stub: marks signal `auto_draft=true` so next radar run picks it up.
 * Post-hackathon: spawn dedicated Inngest function for single-signal draft generation.
 */
export async function generateOnDemandDraft(raw: unknown) {
  const input = GenerateOnDemandInput.parse(raw);
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("signals")
    .update({ auto_draft: true })
    .eq("id", input.signal_id)
    .eq("organization_id", input.organization_id);

  if (error) {
    return { ok: false, reason: error.message };
  }

  // Trigger radar single-signal sweep (hackathon: piggybacks on standard radar tick)
  try {
    await inngest.send({
      name: "competitor-radar.tick",
      data: {
        organization_id: input.organization_id,
        sweep_window_hours: 1,
      },
    });
  } catch (err) {
    console.error("[generateOnDemandDraft] inngest.send failed", err);
    // Signal flagged auto_draft=true; next live radar run will pick up.
  }

  revalidatePath(`/demo/${input.brand_slug}`);
  return { ok: true };
}
