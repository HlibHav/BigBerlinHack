"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

interface Props {
  brandSlug: string;
  text: string;
  /** Truncate to this many chars before sending to TTS (Gradium has 4000 cap). */
  maxChars?: number;
}

/**
 * 🔊 Preview voice — POSTs the supplied text to /api/podcast/tts (Gradium)
 * and plays the resulting audio inline. Manages its own loading + playing
 * state so multiple buttons на сторінці не interfere з each other.
 *
 * One audio element per button keeps memory bounded; we revoke the blob URL
 * once playback ends (or component unmounts).
 */
export function VoicePreviewButton({
  brandSlug,
  text,
  maxChars = 800,
}: Props) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function play() {
    if (state === "loading") return;
    if (state === "playing") {
      audioRef.current?.pause();
      audioRef.current = null;
      setState("idle");
      return;
    }
    setState("loading");
    const truncated = text.slice(0, maxChars);
    try {
      const res = await fetch("/api/podcast/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_slug: brandSlug, text: truncated }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "TTS failed" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setState("idle");
        audioRef.current = null;
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setState("idle");
        audioRef.current = null;
        toast.error("Audio playback failed");
      };
      audioRef.current = audio;
      setState("playing");
      await audio.play();
    } catch (err) {
      setState("idle");
      const reason = err instanceof Error ? err.message : "unknown";
      toast.error("Voice preview failed", { description: reason });
    }
  }

  const label =
    state === "loading"
      ? "⏳ Generating…"
      : state === "playing"
        ? "⏸ Stop"
        : "🔊 Preview voice";

  return (
    <button
      type="button"
      onClick={play}
      disabled={state === "loading"}
      className="rounded border border-border bg-secondary px-2 py-1 text-[10px] font-medium text-secondary-foreground transition-colors hover:bg-secondary/70 disabled:opacity-60"
      aria-label="Preview voice for this talking point"
    >
      {label}
    </button>
  );
}
