// Scoring helpers — copied verbatim from inngest/functions/narrative-simulator.ts
// (lines 60-141) so eval scripts can replicate the production score computation
// without importing the server-only Inngest module.
//
// Keep in sync with the source. If the production formula changes, update this
// file and re-run the sensitivity eval.

/**
 * Score formula per CONTRACTS.md §2.5:
 *   score = mention_rate × (1 / avg_position), clamped to [0, 1].
 *   avg_position = null  → score = 0 (brand never mentioned).
 */
export function computeScore(
  mention_rate: number,
  avg_position: number | null,
): number {
  if (avg_position === null) return 0;
  const safePos = Math.max(1, avg_position);
  const raw = mention_rate * (1 / safePos);
  return Math.max(0, Math.min(1, raw));
}

/**
 * 1-indexed position of a brand inside the ranked list. Case-insensitive
 * substring match (e.g. "Attio CRM" still counts as Attio). Returns null if
 * the brand is absent.
 */
export function findBrandPosition(
  ranking: string[],
  brand_name: string,
): number | null {
  const needle = brand_name.toLowerCase();
  const idx = ranking.findIndex((name) => name.toLowerCase().includes(needle));
  return idx === -1 ? null : idx + 1;
}

/**
 * Aggregate per-prompt × per-model positions into mention_rate and
 * avg_position. avg_position only averages runs that mentioned the brand.
 */
export function aggregateScores(positions: Array<number | null>): {
  mention_rate: number;
  avg_position: number | null;
} {
  if (positions.length === 0) return { mention_rate: 0, avg_position: null };
  const mentions = positions.filter((p): p is number => p !== null);
  const mention_rate = mentions.length / positions.length;
  const avg_position =
    mentions.length === 0
      ? null
      : mentions.reduce((acc, n) => acc + n, 0) / mentions.length;
  return { mention_rate, avg_position };
}

/**
 * Original 5 evergreen CRM-category probes used by the W5 simulator when the
 * Peec snapshot has fewer than 3 prompts. These also serve as the canonical
 * scoring set for the sensitivity eval — they are what production would use
 * for an unseeded org.
 */
export const FALLBACK_SCORING_PROMPTS = [
  "What are the top CRM platforms for high-growth startups in 2026?",
  "Which modern CRM tools best handle relationship intelligence at scale?",
  "List the leading alternatives to Salesforce for tech companies.",
  "Which CRM platforms have the best data model for B2B SaaS teams?",
  "Recommend a CRM with strong API and customization for product teams.",
] as const;
