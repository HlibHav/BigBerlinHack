import "server-only";

/**
 * Centralized USD pricing tables (per 1M tokens unless noted) for cost ledger.
 * Update here when provider pricing shifts; every wrapper reads through these
 * helpers so we never sprinkle magic numbers in service code.
 *
 * All return values are in `usd_cents` rounded UP — under-billing the ledger
 * is worse than over-billing during demo audit.
 */

const cents = (usd: number) => Math.ceil(usd * 100);

// --- OpenAI -----------------------------------------------------------------

type OpenAIChatModel = "gpt-4o-mini" | "gpt-4o" | (string & {});

const OPENAI_PRICING: Record<string, { input_per_1m_usd: number; output_per_1m_usd: number }> = {
  "gpt-4o-mini": { input_per_1m_usd: 0.15, output_per_1m_usd: 0.6 },
  "gpt-4o": { input_per_1m_usd: 2.5, output_per_1m_usd: 10 },
};

export function openaiCost(
  model: OpenAIChatModel,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = OPENAI_PRICING[model];
  if (!price) {
    // Unknown model — bill defensively at gpt-4o tier so we notice in the
    // ledger instead of silently zeroing out cost.
    const fallback = OPENAI_PRICING["gpt-4o"]!;
    const usd =
      (inputTokens / 1_000_000) * fallback.input_per_1m_usd +
      (outputTokens / 1_000_000) * fallback.output_per_1m_usd;
    return cents(usd);
  }
  const usd =
    (inputTokens / 1_000_000) * price.input_per_1m_usd +
    (outputTokens / 1_000_000) * price.output_per_1m_usd;
  return cents(usd);
}

// --- Anthropic --------------------------------------------------------------

type AnthropicModel = "claude-sonnet-4-5" | (string & {});

const ANTHROPIC_PRICING: Record<string, { input_per_1m_usd: number; output_per_1m_usd: number }> = {
  "claude-sonnet-4-6": { input_per_1m_usd: 3, output_per_1m_usd: 15 },
  "claude-sonnet-4-5": { input_per_1m_usd: 3, output_per_1m_usd: 15 },
  "claude-haiku-4-5-20251001": { input_per_1m_usd: 1, output_per_1m_usd: 5 },
};

export function anthropicCost(
  model: AnthropicModel,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = ANTHROPIC_PRICING[model] ?? ANTHROPIC_PRICING["claude-sonnet-4-5"]!;
  const usd =
    (inputTokens / 1_000_000) * price.input_per_1m_usd +
    (outputTokens / 1_000_000) * price.output_per_1m_usd;
  return cents(usd);
}

// --- Embeddings (OpenAI text-embedding-3-small) -----------------------------

const EMBEDDING_PRICE_PER_1M_USD = 0.02;

export function embeddingCost(tokens: number): number {
  const usd = (tokens / 1_000_000) * EMBEDDING_PRICE_PER_1M_USD;
  return cents(usd);
}
