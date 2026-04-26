import { NextResponse, type NextRequest } from "next/server";

import { gradiumTts } from "@/lib/services/gradium";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/morning-brief/voice/:deliveryId
 *
 * Reads `voice_script` from brief_deliveries (populated by W6′
 * generate-voice-script step) and renders it via Gradium TTS. Returns
 * audio/wav stream so the dashboard can <audio>-play it inline.
 *
 * RLS-safe: the brief_deliveries select uses service-role client, but we
 * only return audio when the parent organization is `is_public_demo=true`.
 * Cost ledger row is written by gradiumTts() automatically; we attribute
 * it to the brief's organization_id.
 *
 * voice_script is null until the rewrite step persists it; we 404 in that
 * case so the UI can hide the play button gracefully.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { deliveryId: string } },
) {
  if (!params.deliveryId || params.deliveryId.length < 8) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: brief, error } = await supabase
    .from("brief_deliveries")
    .select("id, organization_id, voice_script, summary_body")
    .eq("id", params.deliveryId)
    .maybeSingle();

  if (error || !brief) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!brief.voice_script) {
    return NextResponse.json(
      { error: "voice script not yet generated" },
      { status: 404 },
    );
  }

  // Confirm parent org is public-demo before serving audio.
  const { data: org } = await supabase
    .from("organizations")
    .select("id, is_public_demo")
    .eq("id", brief.organization_id)
    .maybeSingle();
  if (!org?.is_public_demo) {
    return NextResponse.json({ error: "not public" }, { status: 403 });
  }

  try {
    const result = await gradiumTts({
      text: brief.voice_script,
      output_format: "wav",
      organization_id: brief.organization_id,
    });
    return new NextResponse(result.audio, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    console.error("[morning-brief-voice] gradium error", reason);
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
