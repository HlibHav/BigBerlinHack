"use client";

import { useState } from "react";
import { formatRelative, truncateAtWord } from "@/lib/utils";

/**
 * AI-conversation evidence — surfaces real Peec chats where the brand was
 * mentioned by an AI engine (ChatGPT / Perplexity / etc.) near the time the
 * signal was detected. Stronger evidence than a static URL list because it
 * shows the literal AI response that motivated the signal.
 *
 * Data shape mirrors `data/peec-snapshot.json → chats[]` (Peec MCP `list_chats`
 * + `get_chat`). `messages` come back as `[{role, content}, ...]`; we expect
 * one user prompt + one assistant reply per chat.
 *
 * Hidden behind an opt-in chevron — most signals will have ≥1 chat and we
 * don't want to push the card height by default.
 */
export type AiChat = {
  id: string;
  prompt_id: string;
  date: string;
  model_id: string;
  user: string;
  assistant: string;
  brands_mentioned: string[];
  sources: Array<{ url: string; title: string }>;
};

const MODEL_LABEL: Record<string, string> = {
  "perplexity-scraper": "Perplexity",
  "openai-scraper": "ChatGPT",
  "anthropic-scraper": "Claude",
  "google-scraper": "Gemini",
};

function modelLabel(modelId: string): string {
  if (MODEL_LABEL[modelId]) return MODEL_LABEL[modelId];
  return modelId.replace(/-scraper$/, "").replace(/^./, (c) => c.toUpperCase());
}

export function SignalAiEvidence({
  chats,
  brandName,
  scope = "brand",
}: {
  chats: AiChat[];
  brandName: string;
  /**
   * "prompt" — chats are scoped to the specific Peec prompt this signal fired
   *   from (per-prompt signals). Title reflects "AI conversations from this
   *   prompt" because the chats might not all cite the brand individually —
   *   they're the rows that drove the mention-rate calculation.
   *
   * "brand" — chats are everywhere the brand was mentioned. Default for
   *   peec-delta + Tavily signals where there's no single source prompt.
   */
  scope?: "prompt" | "brand";
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (chats.length === 0) return null;

  const heading =
    scope === "prompt"
      ? `🤖 AI conversations from this prompt (${chats.length})`
      : `🤖 AI conversations citing ${brandName} (${chats.length})`;

  return (
    <div className="rounded border border-emerald-200/60 bg-emerald-50/40 p-2 dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
        {heading}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {chats.slice(0, 3).map((chat) => {
          const isOpen = expandedId === chat.id;
          const mentions =
            scope === "prompt"
              ? chat.brands_mentioned.some(
                  (b) => b.toLowerCase() === brandName.toLowerCase(),
                )
              : true;
          return (
            <li key={chat.id} className="rounded bg-background/80 p-2">
              <div className="flex items-baseline justify-between gap-2 text-[10px]">
                <span className="font-mono uppercase text-emerald-700 dark:text-emerald-400">
                  {modelLabel(chat.model_id)}
                </span>
                <div className="flex items-baseline gap-2">
                  {scope === "prompt" ? (
                    <span
                      className={`rounded px-1 py-0.5 text-[9px] font-semibold ${
                        mentions
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                      title={
                        mentions
                          ? `Reply mentions ${brandName} — counts toward the mention-rate.`
                          : `Reply does NOT mention ${brandName} — this is what brings the rate below 100%.`
                      }
                    >
                      {mentions ? `✓ cites ${brandName}` : `× no ${brandName}`}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground">{formatRelative(chat.date)}</span>
                </div>
              </div>
              <p className="mt-1 text-xs italic text-muted-foreground">
                «{truncateAtWord(chat.user, 110)}»
              </p>
              <p className="mt-1 text-xs leading-snug">
                {isOpen ? chat.assistant : truncateAtWord(chat.assistant, 200)}
              </p>
              {chat.assistant.length > 200 ? (
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : chat.id)}
                  className="mt-1 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  {isOpen ? "show less" : "show full reply"}
                </button>
              ) : null}
              {chat.sources.length > 0 ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Sources:{" "}
                  {chat.sources.slice(0, 3).map((s, i) => (
                    <span key={s.url}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-2 hover:underline"
                        title={s.title}
                      >
                        {(() => {
                          try {
                            return new URL(s.url).hostname.replace(/^www\./, "");
                          } catch {
                            return s.url;
                          }
                        })()}
                      </a>
                      {i < Math.min(chat.sources.length, 3) - 1 ? " · " : ""}
                    </span>
                  ))}
                  {chat.sources.length > 3 ? ` (+${chat.sources.length - 3})` : ""}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {chats.length > 3 ? (
        <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Showing 3 most recent of {chats.length}
        </p>
      ) : null}
    </div>
  );
}
