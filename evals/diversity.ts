// Layer 1 — deterministic diversity metrics for a set of W5 variants.
//
// No LLM calls. Pure string analysis. Designed to flag the homogeneity that a
// human spotted in the screenshot: every variant opens with "competitor X
// claims Y, but..." and pivots to "At Attio, we [pillar word]...".

import {
  AI_TROPE_PHRASES,
  FORBIDDEN_WORDS,
} from "@/lib/brand/forbidden-phrases";

import type { DiversityReport, EvalVariant } from "./lib/types";

// Forbidden vocabulary is the SSOT in lib/brand/forbidden-phrases — both the
// W5 simulator (for prompt injection + post-filter) and this Layer 1 metric
// (for hit-detection) consume the same list. Keep changes there, not here.

// Tokenise to lowercase word array (alphanumerics only). Drops punctuation so
// trigrams ignore commas / apostrophes that would otherwise inflate diversity.
function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersect = 0;
  for (const item of a) if (b.has(item)) intersect++;
  return intersect / (a.size + b.size - intersect);
}

function findMatches(body: string, dictionary: readonly string[]): string[] {
  const lower = body.toLowerCase();
  const hits = new Set<string>();
  for (const phrase of dictionary) {
    if (lower.includes(phrase)) hits.add(phrase);
  }
  return Array.from(hits).sort();
}

const STRUCTURAL_PATTERN =
  /\b(but|however|while|though|whereas|yet)\b[\s\S]{0,400}?\bAt\s+Attio\b/i;

export function computeDiversity(variants: EvalVariant[]): DiversityReport {
  const n = variants.length;

  // 1. Opening n-gram (first 8 tokens, case-folded).
  const openings = variants.map((v) => tokenise(v.body).slice(0, 8).join(" "));
  const opening_unique_ratio = new Set(openings).size / Math.max(1, n);

  // 2. Pairwise trigram Jaccard.
  const trigramSets = variants.map(
    (v) => new Set(ngrams(tokenise(v.body), 3)),
  );
  const pairwise: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairwise.push(jaccard(trigramSets[i], trigramSets[j]));
    }
  }
  const trigram_jaccard_pairwise_avg =
    pairwise.length === 0
      ? 0
      : pairwise.reduce((a, b) => a + b, 0) / pairwise.length;
  const trigram_jaccard_max = pairwise.length === 0 ? 0 : Math.max(...pairwise);

  // 3. Forbidden phrase scan (per variant).
  const forbidden_hits = variants.map((v, i) => ({
    variant_idx: i,
    matches: findMatches(v.body, FORBIDDEN_WORDS),
  }));

  // 4. AI trope scan (per variant).
  const ai_trope_hits = variants.map((v, i) => ({
    variant_idx: i,
    matches: findMatches(v.body, AI_TROPE_PHRASES),
  }));

  // 5. Structural pattern: "but/however/while ... At Attio".
  const structural_pattern_count = variants.filter((v) =>
    STRUCTURAL_PATTERN.test(v.body),
  ).length;

  // 6. Length CV.
  const lengths = variants.map((v) => v.body.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  const variance =
    lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) /
    Math.max(1, lengths.length);
  const length_cv = mean === 0 ? 0 : Math.sqrt(variance) / mean;

  // 7. Build human-readable flags.
  const flags: string[] = [];
  if (opening_unique_ratio < 1) {
    flags.push(
      `Repeated opening n-gram across ${n - new Set(openings).size + 0} variant pair(s)`,
    );
  }
  if (trigram_jaccard_pairwise_avg > 0.3) {
    flags.push(
      `High trigram overlap (avg ${trigram_jaccard_pairwise_avg.toFixed(2)} > 0.30 threshold)`,
    );
  }
  const totalForbidden = forbidden_hits.reduce(
    (a, h) => a + h.matches.length,
    0,
  );
  if (totalForbidden > 0) {
    flags.push(`${totalForbidden} forbidden-phrase hit(s) across variants`);
  }
  const totalTropes = ai_trope_hits.reduce((a, h) => a + h.matches.length, 0);
  if (totalTropes > 0) {
    flags.push(`${totalTropes} AI-trope hit(s) across variants`);
  }
  if (structural_pattern_count >= 2) {
    flags.push(
      `${structural_pattern_count}/${n} variants share "but…At Attio" structure`,
    );
  }
  if (length_cv < 0.1 && n > 1) {
    flags.push(
      `Length variance suspiciously uniform (CV ${length_cv.toFixed(3)} < 0.10)`,
    );
  }

  return {
    variant_count: n,
    opening_unique_ratio,
    trigram_jaccard_pairwise_avg,
    trigram_jaccard_max,
    forbidden_hits,
    ai_trope_hits,
    structural_pattern_count,
    length_cv,
    flags,
  };
}
