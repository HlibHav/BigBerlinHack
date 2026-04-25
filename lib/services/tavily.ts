import "server-only";

import { z } from "zod";

import { recordCost } from "@/lib/services/cost";

const TavilyResultSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  score: z.number().optional(),
  published_date: z.string().nullable().optional(),
});

const TavilyResponseSchema = z.object({
  query: z.string().optional(),
  results: z.array(TavilyResultSchema).default([]),
  answer: z.string().nullable().optional(),
  response_time: z.number().optional(),
});

export type TavilyResult = z.infer<typeof TavilyResultSchema>;
export type TavilyResponse = z.infer<typeof TavilyResponseSchema>;

export interface TavilySearchInput {
  query: string;
  max_results?: number;
  include_domains?: string[];
  /** Filter out specific domains. Useful for phrase availability checks where own brand pages should not count as "phrase taken". */
  exclude_domains?: string[];
  /** "general" (default) returns broad web results, "news" filters to news index. */
  topic?: "general" | "news";
  /** When topic="news", restrict to last N days (1-365). Ignored for "general". */
  days?: number;
  /** "basic" (default) is fast/cheap; "advanced" pulls deeper context. Same flat cost. */
  search_depth?: "basic" | "advanced";
  organization_id: string;
  /** Optional run_id so the cost row joins to the originating Inngest run. */
  run_id?: string | null;
}

/**
 * Tavily web search. ~$0.01 per call (1 cent). We charge a flat 1 cent per
 * search to the cost ledger — Tavily bills at higher precision but the
 * ledger granularity is whole cents.
 *
 * Supports `topic` ("general"|"news"), `days` (for news), `include_domains`
 * (e.g. ["twitter.com","x.com"] for socials-specific search), `exclude_domains`
 * (own-brand filter for phrase availability), and `search_depth` override.
 */
export async function tavilySearch(input: TavilySearchInput): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("[tavily] TAVILY_API_KEY is not set");
  }

  const body: Record<string, unknown> = {
    api_key: apiKey,
    query: input.query,
    max_results: input.max_results ?? 5,
    search_depth: input.search_depth ?? "basic",
  };

  if (input.include_domains && input.include_domains.length > 0) {
    body.include_domains = input.include_domains;
  }
  if (input.exclude_domains && input.exclude_domains.length > 0) {
    body.exclude_domains = input.exclude_domains;
  }
  if (input.topic) {
    body.topic = input.topic;
  }
  if (input.topic === "news" && typeof input.days === "number" && input.days > 0) {
    body.days = Math.min(Math.max(Math.floor(input.days), 1), 365);
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[tavily] HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const parsed = TavilyResponseSchema.parse(json);

  await recordCost({
    organization_id: input.organization_id,
    service: "tavily",
    operation: "search",
    usd_cents: 1,
    tokens_or_units: parsed.results.length,
    run_id: input.run_id ?? null,
  });

  return parsed;
}
