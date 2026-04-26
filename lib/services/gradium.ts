import "server-only";

import { recordCost } from "@/lib/services/cost";

/**
 * Gradium voice AI wrapper. Per docs.gradium.ai/api-reference/endpoint/tts-post.
 *
 * Used in W11 podcast prep — gives the founder a "🔊 Preview voice" button
 * per talking point so they can hear how their suggested phrasing sounds
 * spoken aloud BEFORE the recording. Naturality is judged by ear, not just
 * by an LLM rubric.
 *
 * One of the three partner technologies declared for Big Berlin Hack
 * (Tavily + Gemini + Gradium). Counts toward the 3-tech requirement.
 */

const GRADIUM_TTS_URL = "https://api.gradium.ai/api/post/speech/tts";

// Default voice — Emma, English US feminine. Per docs default example.
// Override per call if user picks a different voice from the all-voices list.
export const DEFAULT_GRADIUM_VOICE_ID = "YTpq7expH9539ERJ";

export type GradiumOutputFormat = "wav" | "ogg" | "pcm";

export interface GradiumTtsInput {
  text: string;
  voice_id?: string;
  output_format?: GradiumOutputFormat;
  organization_id: string;
  run_id?: string | null;
}

export interface GradiumTtsResult {
  /** Raw audio bytes — pipe to client as audio/wav (or matching format). */
  audio: ArrayBuffer;
  /** MIME type matching the chosen output_format. */
  contentType: string;
  /** Approximate billed units (we use char count as a proxy until we wire credits). */
  approxUnits: number;
}

/**
 * Synthesize speech via Gradium TTS. Returns raw audio bytes — caller pipes
 * them to the client as a streaming response.
 *
 * Cost ledger: we don't yet have authoritative pricing per char, so we log
 * `tokens_or_units` = input character count for downstream attribution and
 * usd_cents = 0 (placeholder). Wire real pricing when Gradium publishes it
 * or once we hit the credits endpoint to count actual draws.
 */
export async function gradiumTts(
  input: GradiumTtsInput,
): Promise<GradiumTtsResult> {
  if (!process.env.GRADIUM_API_KEY) {
    throw new Error("[gradium] GRADIUM_API_KEY is not set");
  }
  if (input.text.length < 1 || input.text.length > 4000) {
    throw new Error(
      `[gradium] text length out of range (1-4000 chars), got ${input.text.length}`,
    );
  }

  const voice_id = input.voice_id ?? DEFAULT_GRADIUM_VOICE_ID;
  const output_format = input.output_format ?? "wav";
  const contentType =
    output_format === "wav"
      ? "audio/wav"
      : output_format === "ogg"
        ? "audio/ogg"
        : "audio/pcm";

  const res = await fetch(GRADIUM_TTS_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.GRADIUM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: input.text,
      voice_id,
      output_format,
      only_audio: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[gradium] HTTP ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    );
  }

  const audio = await res.arrayBuffer();

  // Cost ledger row — units = char count, usd_cents = 0 (placeholder).
  // Once Gradium pricing is wired we update geminiCost-style helper here.
  await recordCost({
    organization_id: input.organization_id,
    service: "gradium",
    operation: `tts:${voice_id}`,
    usd_cents: 0,
    tokens_or_units: input.text.length,
    run_id: input.run_id ?? null,
  });

  return { audio, contentType, approxUnits: input.text.length };
}

/** True iff Gradium API key is configured. UI uses this to hide voice button. */
export function isGradiumAvailable(): boolean {
  return Boolean(process.env.GRADIUM_API_KEY);
}
