import "server-only";

import bundledSnapshot from "@/data/peec-snapshot.json";
import {
  type PeecAction,
  type PeecBrand,
  type PeecBrandReportRow,
  type PeecChat,
  type PeecSnapshotFile,
  type PeecUrlReportRow,
  PeecSnapshotFileSchema,
} from "@/lib/schemas/peec-snapshot";

/**
 * Read + parse the committed Peec snapshot file. Per
 * `decisions/2026-04-25-mcp-only-peec-attio-demo.md`, Peec data is pulled into
 * `data/peec-snapshot.json` via Claude Code MCP session — there is no live REST
 * call from server runtime. Static JSON import щоб webpack включив файл у serverless
 * bundle (Vercel file tracing не статично детектить readFile з dynamic path).
 * Refresh workflow тойсамий: оновити JSON у репо, commit, redeploy.
 */
export async function loadPeecSnapshot(): Promise<PeecSnapshotFile> {
  return PeecSnapshotFileSchema.parse(bundledSnapshot) as PeecSnapshotFile;
}

/** Latest brand_reports row for a brand by display name. Null if not present. */
export function getLatestBrandReport(
  snapshot: PeecSnapshotFile,
  brand_name: string,
): PeecBrandReportRow | null {
  const rows = (snapshot.brand_reports ?? []).filter(
    (r) => r.brand_name.toLowerCase() === brand_name.toLowerCase(),
  );
  if (rows.length === 0) return null;
  return rows.reduce((acc, row) => (row.date > acc.date ? row : acc));
}

/**
 * N-day lookback for a brand. `days` is inclusive of today (UTC) — pass 7 for
 * the past week. Returns rows newest-first.
 */
export function getBrandReportHistory(
  snapshot: PeecSnapshotFile,
  brand_name: string,
  days: number,
): PeecBrandReportRow[] {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(0, days - 1));
  const cutoffIso = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD
  return (snapshot.brand_reports ?? [])
    .filter(
      (r) =>
        r.brand_name.toLowerCase() === brand_name.toLowerCase() && r.date >= cutoffIso,
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * All chats where `brand_name` is mentioned. Optional `limit` truncates after
 * sorting newest-first.
 */
export function getChatsForBrand(
  snapshot: PeecSnapshotFile,
  brand_name: string,
  limit?: number,
): PeecChat[] {
  const needle = brand_name.toLowerCase();
  const matches = (snapshot.chats ?? [])
    .filter((c) => c.brands_mentioned.some((b) => b.toLowerCase() === needle))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return typeof limit === "number" ? matches.slice(0, limit) : matches;
}

/** Filter actions by group_type. Returns sorted by opportunity_score desc. */
export function getActions(
  snapshot: PeecSnapshotFile,
  scope: "owned" | "editorial" | "reference" | "ugc",
): PeecAction[] {
  return (snapshot.actions ?? [])
    .filter((a) => a.group_type === scope)
    .sort((a, b) => b.opportunity_score - a.opportunity_score);
}

/** Resolve own brand row from snapshot.brands. Null if no `is_own=true`. */
export function getOwnBrand(snapshot: PeecSnapshotFile): PeecBrand | null {
  return (snapshot.brands ?? []).find((b) => b.is_own) ?? null;
}

/**
 * Citation gaps — URLs where competitors are cited but the own brand is NOT.
 * High-retrieval gaps = priority outreach targets (earned-media / SEO).
 *
 * Returns rows sorted by `retrievals` desc, with each row enriched with the
 * list of competitor brand names cited from that URL (display-friendly).
 *
 * Per Peec docs (https://docs.peec.ai/mcp/tools, get_url_report) — citation gap
 * is the canonical use of url_report for own-brand earned-media surfacing.
 */
export type CitationGap = PeecUrlReportRow & {
  competitor_brand_names: string[];
};

export function getCitationGaps(
  snapshot: PeecSnapshotFile,
  options?: { limit?: number },
): CitationGap[] {
  const own = getOwnBrand(snapshot);
  if (!own) return [];
  const brandsById = new Map((snapshot.brands ?? []).map((b) => [b.id, b]));
  const gaps: CitationGap[] = [];
  for (const row of snapshot.url_report ?? []) {
    if (row.mentioned_brand_ids.includes(own.id)) continue;
    const competitorIds = row.mentioned_brand_ids.filter((id) => id !== own.id);
    if (competitorIds.length === 0) continue;
    const competitor_brand_names = competitorIds
      .map((id) => brandsById.get(id)?.name)
      .filter((n): n is string => Boolean(n));
    if (competitor_brand_names.length === 0) continue;
    gaps.push({ ...row, competitor_brand_names });
  }
  gaps.sort((a, b) => b.retrievals - a.retrievals);
  return typeof options?.limit === "number" ? gaps.slice(0, options.limit) : gaps;
}

/**
 * Top URLs ranked by retrievals — use to surface "where AI engines pull from"
 * regardless of citation status. Helpful for editorial outreach context.
 */
export function getTopRetrievalUrls(
  snapshot: PeecSnapshotFile,
  limit = 5,
): PeecUrlReportRow[] {
  return (snapshot.url_report ?? [])
    .slice()
    .sort((a, b) => b.retrievals - a.retrievals)
    .slice(0, limit);
}

/**
 * Last-message-pair extractor for a Peec chat — returns the user prompt and
 * the assistant response, both as strings. Falls back to empty string when
 * messages don't follow expected role/content shape.
 */
export function extractChatExchange(chat: PeecChat): {
  user: string;
  assistant: string;
} {
  const msgs = (chat.messages ?? []) as Array<{ role?: string; content?: string }>;
  const user = msgs.find((m) => m?.role === "user")?.content ?? "";
  const assistant = msgs.find((m) => m?.role === "assistant")?.content ?? "";
  return { user: String(user), assistant: String(assistant) };
}

/**
 * Compact, prompt-ready context block that summarizes a competitor's current
 * Peec footprint — visibility, share-of-voice, sentiment, position, plus
 * day-over-day deltas and aggregate mention-rate across all tracked Peec
 * prompts.
 *
 * Used to inject Peec metric context into Tavily-side prompts so the model
 * doesn't reason about a competitor news article in a vacuum:
 *   - `classify-tavily` step uses it to weight severity (loud headline +
 *     flat Peec = noise; mild headline + climbing Peec = real movement).
 *   - Tavily counter-draft generation uses it so the body can reference
 *     concrete brand-engine numerics, not just the article excerpt.
 *
 * Returns `null` when no Peec data exists for the brand — caller should
 * gracefully omit the section instead of inserting an empty block.
 */
export function buildPeecCompetitorContext(
  snapshot: PeecSnapshotFile,
  brand_name: string,
): string | null {
  const history = getBrandReportHistory(snapshot, brand_name, 7);
  if (history.length === 0) return null;
  const curr = history[0];
  const prev = history[1] ?? null;

  const lines: string[] = [
    `Latest Peec snapshot (${curr.date}):`,
    `- visibility: ${(curr.visibility * 100).toFixed(0)}%`,
    `- share-of-voice: ${(curr.share_of_voice * 100).toFixed(0)}%`,
    `- sentiment: ${curr.sentiment}`,
    `- avg position: ${curr.position !== null ? curr.position.toFixed(1) : "n/a"}`,
  ];

  if (prev) {
    const visDeltaPct = ((curr.visibility - prev.visibility) * 100).toFixed(1);
    const visDirection = curr.visibility > prev.visibility ? "▲" : curr.visibility < prev.visibility ? "▼" : "—";
    const posDelta =
      curr.position !== null && prev.position !== null
        ? (curr.position - prev.position).toFixed(2)
        : "n/a";
    const sentimentChanged = curr.sentiment !== prev.sentiment;
    lines.push(
      `Day-over-day delta vs ${prev.date}:`,
      `- visibility ${visDirection} ${visDeltaPct} pp`,
      `- position Δ ${posDelta} (lower = better, neg means improved)`,
      `- sentiment ${sentimentChanged ? `flipped ${prev.sentiment} → ${curr.sentiment}` : "unchanged"}`,
    );
  } else {
    lines.push(`Day-over-day delta: n/a (single-day snapshot — refresh peec-snapshot.json via MCP for delta).`);
  }

  // Aggregate mention-rate across all Peec prompts. Single number compresses
  // "is this competitor dominant in AI-engine answers" without enumerating
  // every prompt.
  const allChats = snapshot.chats ?? [];
  if (allChats.length > 0) {
    const needle = brand_name.toLowerCase();
    const peecBrand = (snapshot.brands ?? []).find(
      (b) => b.name.toLowerCase() === needle,
    );
    const mentioned = allChats.filter((c) =>
      c.brands_mentioned.some(
        (b) => b.toLowerCase() === needle || (peecBrand && b === peecBrand.id),
      ),
    );
    const aggregateRate = (mentioned.length / allChats.length) * 100;
    lines.push(
      `AI-engine prompt dominance: mentioned in ${mentioned.length}/${allChats.length} tracked Peec chats (${aggregateRate.toFixed(0)}%).`,
    );
  }

  return lines.join("\n");
}
