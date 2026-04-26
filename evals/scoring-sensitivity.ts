// Layer 3 — scoring sensitivity probe.
//
// Replicates the production scoring step from inngest/functions/narrative-simulator.ts
// (gather-context → score-variants) on three contrast pairs. If the pairs that
// SHOULD differ in score (attio_vs_competitor, real_vs_gibberish) come out
// near-identical, that confirms the user's hypothesis that the ranking-prompt
// judges return the same Attio ranking from baseline brand knowledge,
// regardless of the variant body.

import { z } from "zod";

import {
  evalGenerateObjectAnthropic,
  evalGenerateObjectOpenAI,
} from "./lib/llm";
import {
  aggregateScores,
  computeScore,
  FALLBACK_SCORING_PROMPTS,
  findBrandPosition,
} from "./lib/scoring";
import type {
  ContrastFixture,
  ScoredVariant,
  SensitivityCase,
  SensitivityReport,
} from "./lib/types";

// Same shape the production simulator uses for the per-prompt ranking call.
const BrandRankingSchema = z.object({
  brand_ranking: z.array(z.string()).max(15),
  reasoning: z.string().min(1),
});
type BrandRanking = z.infer<typeof BrandRankingSchema>;

function buildRankingPrompt(
  brand_name: string,
  variant_body: string,
  panel_prompt: string,
): string {
  return [
    `Brand-positioning context (a candidate counter-narrative for ${brand_name}):`,
    `"""`,
    variant_body,
    `"""`,
    ``,
    `Question: ${panel_prompt}`,
    ``,
    `List up to 10 brand names ordered by how strongly you would recommend them, most-recommended first. Provide a one-sentence reasoning.`,
  ].join("\n");
}

interface ScoreOnceArgs {
  label: string;
  body: string;
  brand_name: string;
  panel_prompts: readonly string[];
}

// Cache by body hash (string identity) so the identical pair only burns one
// real LLM call per (prompt × model) combination instead of two.
const scoreCache = new Map<string, ScoredVariant>();

function cacheKey(body: string, brand_name: string): string {
  return `${brand_name}::${body}`;
}

async function scoreVariantOnce(args: ScoreOnceArgs): Promise<{
  scored: ScoredVariant;
  llm_calls: number;
}> {
  const key = cacheKey(args.body, args.brand_name);
  const cached = scoreCache.get(key);
  if (cached) {
    return { scored: { ...cached, label: args.label }, llm_calls: 0 };
  }

  const positions: Array<number | null> = [];
  let calls = 0;

  for (const panel_prompt of args.panel_prompts) {
    const ranking_prompt = buildRankingPrompt(
      args.brand_name,
      args.body,
      panel_prompt,
    );
    const [openaiRes, anthropicRes] = await Promise.all([
      evalGenerateObjectOpenAI<BrandRanking>({
        schema: BrandRankingSchema,
        prompt: ranking_prompt,
        model: "gpt-4o-mini",
        schemaName: "BrandRanking",
        temperature: 0,
      }),
      evalGenerateObjectAnthropic<BrandRanking>({
        schema: BrandRankingSchema,
        prompt: ranking_prompt,
        model: "claude-haiku-4-5-20251001",
        schemaName: "BrandRanking",
        temperature: 0,
      }),
    ]);
    calls += 2;
    positions.push(
      findBrandPosition(openaiRes.object.brand_ranking, args.brand_name),
      findBrandPosition(anthropicRes.object.brand_ranking, args.brand_name),
    );
  }

  const { mention_rate, avg_position } = aggregateScores(positions);
  const score = computeScore(mention_rate, avg_position);

  const scored: ScoredVariant = {
    label: args.label,
    body_preview: args.body.slice(0, 120),
    positions,
    mention_rate,
    avg_position,
    score,
  };
  scoreCache.set(key, scored);
  return { scored, llm_calls: calls };
}

const CASE_EXPECTATIONS: Record<
  SensitivityCase["case_id"],
  { expectation: string; significant_delta: number }
> = {
  identical: {
    expectation: "Δscore == 0 (deterministic with temp=0)",
    significant_delta: 0.001,
  },
  attio_vs_competitor: {
    expectation: "Δscore >> 0; Attio variant scores higher than competitor variant",
    significant_delta: 0.1,
  },
  real_vs_gibberish: {
    expectation: "Δscore >> 0; real Attio variant scores higher than lorem ipsum",
    significant_delta: 0.1,
  },
};

export async function runScoringSensitivity(
  fixture: ContrastFixture,
): Promise<SensitivityReport> {
  scoreCache.clear();
  const { brand_name } = fixture;
  const panel_prompts = FALLBACK_SCORING_PROMPTS;

  const cases: SensitivityCase[] = [];
  let total_llm_calls = 0;

  for (const case_id of [
    "identical",
    "attio_vs_competitor",
    "real_vs_gibberish",
  ] as const) {
    const pair = fixture.pairs[case_id];
    const exp = CASE_EXPECTATIONS[case_id];

    const aRes = await scoreVariantOnce({
      label: `${case_id}.a`,
      body: pair.a,
      brand_name,
      panel_prompts,
    });
    const bRes = await scoreVariantOnce({
      label: `${case_id}.b`,
      body: pair.b,
      brand_name,
      panel_prompts,
    });
    total_llm_calls += aRes.llm_calls + bRes.llm_calls;

    const delta_score = Math.abs(aRes.scored.score - bRes.scored.score);
    const delta_mention_rate = Math.abs(
      aRes.scored.mention_rate - bRes.scored.mention_rate,
    );

    let flag: SensitivityCase["flag"];
    if (case_id === "identical") {
      flag = delta_score <= exp.significant_delta ? "pass" : "fail";
    } else {
      // For contrast pairs we want a LARGE delta. Small delta → judges ignore body.
      if (delta_score >= exp.significant_delta) flag = "pass";
      else if (delta_score >= exp.significant_delta / 2) flag = "warn";
      else flag = "fail";
    }

    cases.push({
      case_id,
      expectation: exp.expectation,
      a: aRes.scored,
      b: bRes.scored,
      delta_score,
      delta_mention_rate,
      flag,
    });
  }

  const failingContrast = cases
    .filter((c) => c.case_id !== "identical")
    .filter((c) => c.flag !== "pass");
  const hypothesis_confirmed = failingContrast.length > 0;

  return {
    cases,
    hypothesis_confirmed,
    total_llm_calls,
  };
}
