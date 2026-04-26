import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DEFAULT_GRADIUM_VOICE_ID,
  gradiumTts,
} from "@/lib/services/gradium";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  brand_slug: z.string().min(1).max(80),
  text: z.string().min(1).max(4000),
  voice_id: z.string().min(4).max(40).optional(),
});

/**
 * POST /api/podcast/tts
 *
 * Body: { brand_slug, text, voice_id? }
 * Response: audio/wav stream of synthesized speech.
 *
 * Used by the W11 PodcastBriefDetail "🔊 Preview voice" button so the
 * founder can hear how a talking point sounds spoken aloud before the
 * recording. brand_slug is resolved to organization_id for cost-ledger
 * attribution + RLS-safe scope of the demo brand.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be JSON" },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, is_public_demo")
    .eq("slug", parsed.data.brand_slug)
    .maybeSingle();

  if (!org || !org.is_public_demo) {
    return NextResponse.json(
      { error: "Brand not found or not public-demo eligible" },
      { status: 404 },
    );
  }

  try {
    const result = await gradiumTts({
      text: parsed.data.text,
      voice_id: parsed.data.voice_id ?? DEFAULT_GRADIUM_VOICE_ID,
      output_format: "wav",
      organization_id: org.id,
    });
    return new NextResponse(result.audio, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
        "X-Voice-Id": parsed.data.voice_id ?? DEFAULT_GRADIUM_VOICE_ID,
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    console.error("[tts] gradium error", reason);
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
