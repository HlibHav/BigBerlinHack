// Shared brand-voice forbidden vocabulary.
//
// Single source of truth for both the W5 simulator (which inlines these into
// its prompt as "NEVER use") and the eval suite (which scans variant bodies
// for hits). Sourced from:
//   - ~/.claude/CLAUDE.md anti-AI writing rules ("leverage", "streamline",
//     "empower")
//   - knowledge/brand-voice/knowledge.md
//   - empirical observations from evals/reports/2026-04-26T04-52 baseline run
//
// Keep this list canonical. If you add an entry, both the simulator prompt
// and Layer 1 diversity metric pick it up automatically.

export const FORBIDDEN_WORDS = [
  "leverage",
  "leveraging",
  "streamline",
  "streamlining",
  "empower",
  "empowering",
  "empowers",
  "delve",
  "delves",
  "delving",
  "robust",
  "seamless",
  "seamlessly",
  "navigate",
  "navigating",
  "tapestry",
  "beacon",
  "synergy",
  "synergies",
  "synergistic",
  "unleash",
  "unleashes",
  "unleashing",
  "revolutioniz", // catches revolutionize / revolutionizing / revolutionizes
  "game-chang", // catches game-changer / game-changing
  "cutting-edge",
  "best-in-class",
  "world-class",
  "next-level",
  "stand out from the crowd",
  "in today's fast-paced",
  "in the ever-evolving",
] as const;

export const AI_TROPE_PHRASES = [
  "we believe",
  "we focus on",
  "we prioritize",
  "we empower",
  "we deliver",
  "settle for",
  "settling for",
  "the status quo",
  "the truth is",
  "build the future",
  "build your business",
  "with confidence",
  "true power",
  "make every interaction",
  "meaningful and impactful",
  "elevate your",
  "thrive with it",
  "in a landscape where",
  "rather than settling",
] as const;

export type ForbiddenWord = (typeof FORBIDDEN_WORDS)[number];
export type AITrope = (typeof AI_TROPE_PHRASES)[number];

/**
 * Case-insensitive substring scan. Returns the matched phrases (deduplicated,
 * sorted) so callers can both count hits and surface the actual offenders.
 */
export function findForbiddenHits(body: string): {
  forbidden_words: string[];
  ai_tropes: string[];
} {
  const lower = body.toLowerCase();
  const forbidden_words = new Set<string>();
  const ai_tropes = new Set<string>();
  for (const w of FORBIDDEN_WORDS) {
    if (lower.includes(w)) forbidden_words.add(w);
  }
  for (const p of AI_TROPE_PHRASES) {
    if (lower.includes(p)) ai_tropes.add(p);
  }
  return {
    forbidden_words: Array.from(forbidden_words).sort(),
    ai_tropes: Array.from(ai_tropes).sort(),
  };
}

/**
 * Total hit count across both lists. Used by the simulator's re-roll gate.
 * Threshold suggestion: ≥2 hits → re-roll once.
 */
export function countForbiddenHits(body: string): number {
  const { forbidden_words, ai_tropes } = findForbiddenHits(body);
  return forbidden_words.length + ai_tropes.length;
}

/**
 * Render a markdown bullet list of all banned terms — for inlining into the
 * simulator's per-variant prompt. Stable ordering for cache hits.
 */
export function renderForbiddenListForPrompt(): string {
  const words = [...FORBIDDEN_WORDS]
    .map((w) => `"${w}"`)
    .join(", ");
  const tropes = [...AI_TROPE_PHRASES]
    .map((p) => `"${p}"`)
    .join(", ");
  return [
    "Forbidden words (any form, even partial — never use):",
    words,
    "",
    "Forbidden phrases / AI tropes (never use, no paraphrase):",
    tropes,
  ].join("\n");
}
