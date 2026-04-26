// Sandbox runner: invoke the improved W5 generation + judge pipeline OUTSIDE
// of Inngest / Supabase. Captures the resulting variants into a fixture file
// that `evals/run-evals.ts --fixture=<name>` can then evaluate.
//
// We deliberately re-declare the angle taxonomy, draft schema, and judge
// prompt here instead of importing from the production module — those imports
// chain into `server-only` and the production cost ledger, both of which we
// want the eval to stay clear of. If you change the production prompts in
// inngest/functions/narrative-simulator.ts or lib/services/variant-judge.ts,
// mirror the change here for the regression run to reflect reality.
//
// Usage:
//   pnpm tsx evals/run-fresh-simulation.ts                       # 3 variants, default seed
//   pnpm tsx evals/run-fresh-simulation.ts --variants=3 --brand=Attio

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  countForbiddenHits,
  findForbiddenHits,
  renderForbiddenListForPrompt,
} from "@/lib/brand/forbidden-phrases";

import {
  evalGenerateObjectAnthropic,
  evalGenerateObjectOpenAI,
} from "./lib/llm";
import { EvalVariantSchema, type EvalVariant } from "./lib/types";

// ---------------------------------------------------------------------------
// Mirrored constants (keep in sync with inngest/functions/narrative-simulator.ts)
// ---------------------------------------------------------------------------

const ANGLES = [
  {
    key: "data_model",
    label: "Data model flexibility",
    hint: "Focus on Attio's flexible objects, custom relationships, and how teams shape the schema to their workflow without admin overhead. Hint at typed records, real-time linking, no rigid lead-account-opportunity hierarchy.",
  },
  {
    key: "migration",
    label: "Migration speed",
    hint: "Focus on how fast a team moves to Attio: days not months, parallel-run period, no data loss, no Big Bang cutover. Concrete numbers (X days, Y records, Z integrations) preferred over adjectives.",
  },
  {
    key: "api_dx",
    label: "Developer experience",
    hint: "Focus on the API and SDK ergonomics: real-time API, typed SDKs, webhook contract, no rate-limit roulette. Audience is engineers who will integrate the CRM with internal systems.",
  },
  {
    key: "pricing",
    label: "Transparent pricing",
    hint: "Focus on transparent pricing and absence of hidden tiers, per-seat surprises, or paid premium features that should be standard. NEVER disparage a competitor by name; talk about the model.",
  },
  {
    key: "speed",
    label: "Daily UX speed",
    hint: "Focus on workspace responsiveness, search latency, keyboard-first navigation, the feel of opening Attio every morning vs the alternative. Concrete UI moments, not abstractions.",
  },
  {
    key: "specialization",
    label: "B2B SaaS / RevOps fit",
    hint: "Focus on Attio being built for modern B2B SaaS / RevOps teams who outgrew generic CRM. Mention the specific shape of customer data SaaS sells (workspaces, seats, expansion) that legacy CRM doesn't model.",
  },
] as const;
type Angle = (typeof ANGLES)[number];

const FORBIDDEN_REROLL_THRESHOLD = 2;

const VariantDraftSchema = z.object({
  body: z.string().min(50).max(1500),
  predicted_sentiment: z.enum(["positive", "neutral", "negative"]),
  score_reasoning: z.string().min(20),
});
type VariantDraft = z.infer<typeof VariantDraftSchema>;

const VariantDimensionsSchema = z.object({
  specificity: z.number().int().min(1).max(10),
  brand_voice: z.number().int().min(1).max(10),
  persuasiveness: z.number().int().min(1).max(10),
  differentiation: z.number().int().min(1).max(10),
});
const VariantVerdictSchema = z.object({
  idx: z.number().int().min(0).max(20),
  judge_score: z.number().int().min(1).max(10),
  judge_reasoning: z.string().min(30),
  dimensions: VariantDimensionsSchema,
});
const JudgeOutputSchema = z.object({
  verdicts: z.array(VariantVerdictSchema).min(1).max(10),
  set_diversity_score: z.number().int().min(1).max(10),
  set_diversity_reasoning: z.string().min(20),
});
type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

// ---------------------------------------------------------------------------
// Path + env helpers (same loader as run-evals.ts)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const EVALS_DIR = dirname(__filename);
const PROJECT_ROOT = resolve(EVALS_DIR, "..");
const FIXTURES_DIR = resolve(EVALS_DIR, "fixtures");

function loadEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, ".env.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    console.warn(`[run-fresh] .env.local not found at ${envPath}`);
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Generation + judge (mirrors production prompts)
// ---------------------------------------------------------------------------

function sampleAngles(n: number): Angle[] {
  const pool = [...ANGLES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return n <= pool.length
    ? pool.slice(0, n)
    : Array.from({ length: n }, (_, i) => pool[i % pool.length]);
}

function buildVariantPrompt(
  brand_name: string,
  brand_voice_pillars: string[],
  angle: Angle,
  retryHint: string,
): string {
  return [
    `You are a senior brand-narrative strategist writing ONE counter-narrative variant for ${brand_name}.`,
    `Brand voice pillars: ${brand_voice_pillars.join(", ")}.`,
    `Seed type: competitor-move. Seed payload: { competitor: "Salesforce | HubSpot", topic: "AI CRM positioning" }`,
    ``,
    `Recent signals (last 7d):`,
    `1. [high/negative] Salesforce launched "Agentforce 3.0" claiming end-to-end AI CRM. Multiple analyst reports.`,
    `2. [med/neutral] HubSpot "free forever" tier expanded; positioning around SMB.`,
    `3. [low/neutral] Pipedrive announced revamped automation builder.`,
    ``,
    `ANGLE FOR THIS VARIANT: ${angle.label}`,
    angle.hint,
    ``,
    `Hard rules:`,
    `- DO NOT use the template "competitor X claims Y, but At Attio…". Open differently — with the proof point, with a number, with a concrete user moment, with a question.`,
    `- DO NOT name a competitor in the opening sentence.`,
    `- Include at least one concrete proof point: a feature name, a number, a measurable outcome, or a named integration.`,
    `- Prose, 3-6 sentences, 50-1500 chars. Conversational and confident, not preachy.`,
    ``,
    renderForbiddenListForPrompt(),
    ``,
    retryHint,
    ``,
    `Return: body (the variant text), predicted_sentiment (positive|neutral|negative — of the variant itself), score_reasoning (≥20 chars on why this nails the "${angle.label}" angle).`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function generateOnce(
  brand_name: string,
  brand_voice_pillars: string[],
  angle: Angle,
  retryHint: string,
  temperature: number,
): Promise<VariantDraft> {
  const { object } = await evalGenerateObjectOpenAI<VariantDraft>({
    schema: VariantDraftSchema,
    prompt: buildVariantPrompt(brand_name, brand_voice_pillars, angle, retryHint),
    model: "gpt-4o-mini",
    schemaName: "VariantDraft",
    temperature,
  });
  return object;
}

async function generateVariants(
  brand_name: string,
  brand_voice_pillars: string[],
  num_variants: number,
): Promise<
  Array<{
    angle: Angle;
    draft: VariantDraft;
    forbidden_retry_count: number;
  }>
> {
  const angles = sampleAngles(num_variants);
  return Promise.all(
    angles.map(async (angle) => {
      let draft = await generateOnce(brand_name, brand_voice_pillars, angle, "", 0.85);
      let forbidden_retry_count = 0;
      const initialHits = countForbiddenHits(draft.body);
      if (initialHits >= FORBIDDEN_REROLL_THRESHOLD) {
        const violations = findForbiddenHits(draft.body);
        const retryHint = `Your previous attempt used these banned terms: ${[...violations.forbidden_words, ...violations.ai_tropes].join(", ")}. Rewrite without ANY of them. Use specific, concrete language instead.`;
        const retry = await generateOnce(
          brand_name,
          brand_voice_pillars,
          angle,
          retryHint,
          0.95,
        );
        forbidden_retry_count = 1;
        if (countForbiddenHits(retry.body) < initialHits) {
          draft = retry;
        }
      }
      return { angle, draft, forbidden_retry_count };
    }),
  );
}

function buildJudgeSystem(brand_name: string, pillars: string[]): string {
  return [
    `You are a senior brand-voice editor evaluating counter-narrative variants for ${brand_name}.`,
    `Brand voice pillars: ${pillars.join(", ") || "confident-builder"}.`,
    ``,
    `Brand voice rules:`,
    `- Prose over bullets. Concrete numbers and product details over abstractions.`,
    `- Opinions over option-lists. Recommend, do not enumerate.`,
    `- Human-detectable writing. The reader should not suspect an LLM wrote this.`,
    ``,
    renderForbiddenListForPrompt(),
    ``,
    `When you score, deduct points for: forbidden words, AI tropes, generic claims without specifics (no product detail / no number / no concrete outcome), preachy or condescending tone, and structural sameness with sibling variants.`,
  ].join("\n");
}

function buildJudgePrompt(
  brand_name: string,
  variants: Array<{ idx: number; body: string }>,
): string {
  const blocks = variants
    .map((v) => `Variant idx=${v.idx}:\n"""\n${v.body}\n"""`)
    .join("\n\n");
  return [
    `Brand under evaluation: ${brand_name}.`,
    `Total variants: ${variants.length}. They are alternative counter-narratives to the SAME competitor seed — they should differ in ANGLE, not just in which competitor they name.`,
    ``,
    blocks,
    ``,
    `For each variant return idx, judge_score 1-10, judge_reasoning ≥30 chars, and dimensions (specificity, brand_voice, persuasiveness, differentiation each 1-10).`,
    `At set level return set_diversity_score 1-10 and set_diversity_reasoning ≥20 chars.`,
  ].join("\n");
}

async function judgeVariants(
  brand_name: string,
  brand_voice_pillars: string[],
  variants: Array<{ idx: number; body: string }>,
): Promise<JudgeOutput> {
  const { object } = await evalGenerateObjectAnthropic<JudgeOutput>({
    schema: JudgeOutputSchema,
    system: buildJudgeSystem(brand_name, brand_voice_pillars),
    prompt: buildJudgePrompt(brand_name, variants),
    model: "claude-sonnet-4-5",
    schemaName: "JudgeOutput",
    temperature: 0,
    maxTokens: 2000,
  });
  return {
    ...object,
    verdicts: [...object.verdicts].sort((a, b) => a.idx - b.idx),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Args {
  numVariants: number;
  brand: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { numVariants: 3, brand: "Attio" };
  for (const arg of argv) {
    if (arg.startsWith("--variants=")) out.numVariants = Number(arg.slice("--variants=".length)) || 3;
    else if (arg.startsWith("--brand=")) out.brand = arg.slice("--brand=".length);
  }
  return out;
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  console.error(`[run-fresh] generating ${args.numVariants} variants for "${args.brand}" at ${stamp}`);

  const drafts = await generateVariants(args.brand, ["confident-builder"], args.numVariants);
  drafts.forEach((d, i) => {
    const hits = findForbiddenHits(d.draft.body);
    console.error(
      `[run-fresh] variant ${i} angle=${d.angle.key} retries=${d.forbidden_retry_count} forbidden_words=${hits.forbidden_words.length} ai_tropes=${hits.ai_tropes.length} body_len=${d.draft.body.length}`,
    );
  });

  const judge = await judgeVariants(
    args.brand,
    ["confident-builder"],
    drafts.map((d, i) => ({ idx: i, body: d.draft.body })),
  );
  console.error(
    `[run-fresh] judge set_diversity=${judge.set_diversity_score}/10 — ${judge.set_diversity_reasoning}`,
  );
  judge.verdicts.forEach((v) => {
    console.error(
      `[run-fresh] verdict idx=${v.idx} judge=${v.judge_score}/10 spc=${v.dimensions.specificity} voice=${v.dimensions.brand_voice} pers=${v.dimensions.persuasiveness} diff=${v.dimensions.differentiation}`,
    );
  });

  // Sort drafts by judge_score desc and assign rank
  const ranked = drafts
    .map((d, i) => {
      const verdict = judge.verdicts.find((v) => v.idx === i);
      if (!verdict) throw new Error(`[run-fresh] no verdict for idx=${i}`);
      return { ...d, verdict };
    })
    .sort((a, b) => b.verdict.judge_score - a.verdict.judge_score)
    .map((d, i) => ({ ...d, rank: i + 1 }));

  const variants: EvalVariant[] = ranked.map((d) =>
    EvalVariantSchema.parse({
      rank: d.rank,
      body: d.draft.body,
      score: d.verdict.judge_score / 10,
      score_reasoning: d.draft.score_reasoning,
      predicted_sentiment: d.draft.predicted_sentiment,
      avg_position: null,
      mention_rate: 0,
      evidence_refs: [`angle:${d.angle.key}`, `seed:eval-fresh-${stamp}`],
    }),
  );

  const fixture = {
    fixture_id: `post-fix-${stamp}`,
    description: `Fresh W5 simulation with angle diversity + forbidden-phrase ban + judge-based scoring. Generated by evals/run-fresh-simulation.ts at ${stamp}. judge_score values are NOT inside the strict EvalVariantSchema typed fields — they are surfaced via score (=judge_score/10).`,
    brand_name: args.brand,
    variants,
    debug: {
      angles_used: drafts.map((d) => d.angle.key),
      forbidden_retries: drafts.reduce((a, d) => a + d.forbidden_retry_count, 0),
      judge_set_diversity_score: judge.set_diversity_score,
      judge_set_diversity_reasoning: judge.set_diversity_reasoning,
      judge_verdicts: judge.verdicts,
    },
  };

  mkdirSync(FIXTURES_DIR, { recursive: true });
  const fixturePath = resolve(FIXTURES_DIR, `${fixture.fixture_id}.json`);
  writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), "utf8");
  console.error(`[run-fresh] wrote fixture → ${fixturePath}`);
  console.log(fixture.fixture_id);
}

main().catch((err) => {
  console.error("[run-fresh] fatal:", err);
  process.exit(1);
});
