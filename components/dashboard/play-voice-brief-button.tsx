"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

interface Props {
  deliveryId: string;
  /** Show button as available — pass false when voice_script is null. */
  available: boolean;
}

/**
 * 🔊 Play voice brief — fetches /api/morning-brief/voice/:id (Gradium TTS
 * over the brief's `voice_script`) and plays the WAV inline. State machine:
 * idle → loading → playing → idle. Click during loading is a no-op; click
 * during playing pauses + resets.
 */
export function PlayVoiceBriefButton({ deliveryId, available }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!available) {
    return (
      <span
        className="rounded border border-border bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground"
        title="Voice script not yet generated — re-trigger the brief or wait ~10s after Slack send"
      >
        🔇 Voice not ready
      </span>
    );
  }

  async function play() {
    if (state === "loading") return;
    if (state === "playing") {
      audioRef.current?.pause();
      audioRef.current = null;
      setState("idle");
      return;
    }
    setState("loading");
    try {
      const res = await fetch(`/api/morning-brief/voice/${deliveryId}`);
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
        toast.error("Playback failed");
      };
      audioRef.current = audio;
      setState("playing");
      await audio.play();
    } catch (err) {
      setState("idle");
      const reason = err instanceof Error ? err.message : "unknown";
      toast.error("Voice brief failed", { description: reason });
    }
  }

  const label =
    state === "loading"
      ? "⏳ Generating audio…"
      : state === "playing"
        ? "⏸ Stop"
        : "🔊 Play voice brief";

  return (
    <button
      type="button"
      onClick={play}
      disabled={state === "loading"}
      className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70 disabled:opacity-60"
    >
      {label}
    </button>
  );
}
