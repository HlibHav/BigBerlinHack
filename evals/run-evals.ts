// CLI runner for the BBH W5 narrative-simulator eval suite.
//
// Usage:
//   pnpm tsx evals/run-evals.ts                            # screenshot fixture, all 3 layers
//   pnpm tsx evals/run-evals.ts --fixture=screenshot-variants
//   pnpm tsx evals/run-evals.ts --run-id=<uuid>            # load N variants from Supabase
//   pnpm tsx evals/run-evals.ts --no-judge --no-sensitivity # Layer 1 only
//
// Env: reads .env.local from the project root. Required keys depend on layers:
//   - Layer 1 needs nothing.
//   - Layer 2 needs ANTHROPIC_API_KEY.
//   - Layer 3 needs OPENAI_API_KEY + ANTHROPIC_API_KEY.
//   - --run-id needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runBrandVoiceJudge } from "./brand-voice-judge";
import { computeDiversity } from "./diversity";
import { runScoringSensitivity } from "./scoring-sensitivity";
import {
  ContrastFixtureSchema,
  EvalVariantSchema,
  FixtureFileSchema,
  type ContrastFixture,
  type DiversityReport,
  type EvalVariant,
  type FixtureFile,
  type FullEvalReport,
  type JudgeReport,
  type SensitivityReport,
} from "./lib/types";

// ---------------------------------------------------------------------------
// Paths + env
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const EVALS_DIR = dirname(__filename);
const PROJECT_ROOT = resolve(EVALS_DIR, "..");
const FIXTURES_DIR = resolve(EVALS_DIR, "fixtures");
const REPORTS_DIR = resolve(EVALS_DIR, "reports");

/**
 * Tiny .env.local loader — avoids adding a `dotenv` dep just for this script.
 * Lines are KEY=VALUE; quoted values stripped; '#' comments skipped.
 */
function loadEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, ".env.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    console.warn(`[evals] .env.local not found at ${envPath}; relying on existing process.env`);
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
    // .env.local wins over inherited env — eval scripts always want the
    // project-local key, not whatever happened to be in the shell.
    process.env[key] = value;
  }
  console.error(
    `[evals] env loaded from ${envPath} — OPENAI=${process.env.OPENAI_API_KEY ? "set" : "unset"}, ANTHROPIC=${process.env.ANTHROPIC_API_KEY ? "set" : "unset"}`,
  );
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Args {
  fixture: string;
  runId: string | null;
  skipJudge: boolean;
  skipSensitivity: boolean;
  contrastFixture: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    fixture: "screenshot-variants",
    runId: null,
    skipJudge: false,
    skipSensitivity: false,
    contrastFixture: "contrast-variants",
  };
  for (const arg of argv) {
    if (arg.startsWith("--fixture=")) out.fixture = arg.slice("--fixture=".length);
    else if (arg.startsWith("--run-id=")) out.runId = arg.slice("--run-id=".length);
    else if (arg.startsWith("--contrast=")) out.contrastFixture = arg.slice("--contrast=".length);
    else if (arg === "--no-judge") out.skipJudge = true;
    else if (arg === "--no-sensitivity") out.skipSensitivity = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      console.warn(`[evals] unknown flag: ${arg}`);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`Usage: pnpm tsx evals/run-evals.ts [options]

Options:
  --fixture=<name>      Load evals/fixtures/<name>.json (default: screenshot-variants)
  --run-id=<uuid>       Instead of file, load narrative_variants for this simulator_run_id from Supabase
  --contrast=<name>     Contrast pairs fixture for Layer 3 (default: contrast-variants)
  --no-judge            Skip Layer 2 (Anthropic LLM judge)
  --no-sensitivity      Skip Layer 3 (Anthropic + OpenAI scoring probe)
  --help, -h            Show this help
`);
}

// ---------------------------------------------------------------------------
// Fixture / Supabase loaders
// ---------------------------------------------------------------------------

function loadFixtureFile(name: string): FixtureFile {
  const path = resolve(FIXTURES_DIR, `${name}.json`);
  const raw = readFileSync(path, "utf8");
  const json: unknown = JSON.parse(raw);
  return FixtureFileSchema.parse(json);
}

function loadContrastFixtureFile(name: string): ContrastFixture {
  const path = resolve(FIXTURES_DIR, `${name}.json`);
  const raw = readFileSync(path, "utf8");
  const json: unknown = JSON.parse(raw);
  return ContrastFixtureSchema.parse(json);
}

async function loadFromSupabase(run_id: string): Promise<FixtureFile> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[evals] --run-id requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("narrative_variants")
    .select(
      "rank, body, score, score_reasoning, predicted_sentiment, avg_position, mention_rate, evidence_refs, simulator_run_id",
    )
    .eq("simulator_run_id", run_id)
    .order("rank", { ascending: true });

  if (error) throw new Error(`[evals] Supabase error: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`[evals] no variants found for simulator_run_id=${run_id}`);
  }

  const variants: EvalVariant[] = data.map((row) => EvalVariantSchema.parse(row));
  return {
    fixture_id: `supabase:${run_id}`,
    description: `Loaded ${variants.length} variants from Supabase for simulator_run_id=${run_id}`,
    brand_name: "Attio",
    variants,
  };
}

// ---------------------------------------------------------------------------
// Markdown report builder
// ---------------------------------------------------------------------------

function flagEmoji(value: number, threshold: number, lowerIsBetter = true): string {
  if (lowerIsBetter) {
    if (value <= threshold) return "✅";
    if (value <= threshold * 1.5) return "⚠️";
    return "❌";
  }
  if (value >= threshold) return "✅";
  if (value >= threshold * 0.66) return "⚠️";
  return "❌";
}

function renderLayer1(report: DiversityReport): string {
  const lines: string[] = [];
  lines.push("## Layer 1 — Deterministic diversity\n");
  lines.push(`- variant_count: ${report.variant_count}`);
  lines.push(
    `- opening_unique_ratio: ${report.opening_unique_ratio.toFixed(2)} ${flagEmoji(report.opening_unique_ratio, 1, false)} (1.0 = all openings unique)`,
  );
  lines.push(
    `- trigram_jaccard_pairwise_avg: ${report.trigram_jaccard_pairwise_avg.toFixed(3)} ${flagEmoji(report.trigram_jaccard_pairwise_avg, 0.3)} (>0.30 = high overlap)`,
  );
  lines.push(
    `- trigram_jaccard_max: ${report.trigram_jaccard_max.toFixed(3)} ${flagEmoji(report.trigram_jaccard_max, 0.4)}`,
  );
  lines.push(
    `- structural_pattern_count: ${report.structural_pattern_count}/${report.variant_count} match \`but…At Attio\` template ${flagEmoji(report.structural_pattern_count, 1)}`,
  );
  lines.push(
    `- length_cv: ${report.length_cv.toFixed(3)} ${flagEmoji(report.length_cv, 0.1, false)} (low CV = uniform length)`,
  );
  lines.push("");
  lines.push("**Forbidden phrase hits:**");
  if (report.forbidden_hits.every((h) => h.matches.length === 0)) {
    lines.push("- ✅ none");
  } else {
    for (const h of report.forbidden_hits) {
      if (h.matches.length === 0) continue;
      lines.push(`- variant #${h.variant_idx}: ${h.matches.join(", ")} ❌`);
    }
  }
  lines.push("");
  lines.push("**AI-trope hits:**");
  if (report.ai_trope_hits.every((h) => h.matches.length === 0)) {
    lines.push("- ✅ none");
  } else {
    for (const h of report.ai_trope_hits) {
      if (h.matches.length === 0) continue;
      lines.push(`- variant #${h.variant_idx}: ${h.matches.join(", ")} ❌`);
    }
  }
  lines.push("");
  if (report.flags.length > 0) {
    lines.push("**Flags:**");
    for (const f of report.flags) lines.push(`- ${f}`);
  } else {
    lines.push("**Flags:** ✅ none");
  }
  return lines.join("\n");
}

function renderLayer2(report: JudgeReport | { skipped: string }): string {
  const lines: string[] = ["", "## Layer 2 — LLM brand-voice judge (claude-sonnet-4-5)\n"];
  if ("skipped" in report) {
    lines.push(`_Skipped: ${report.skipped}_`);
    return lines.join("\n");
  }
  lines.push(
    `- diversity: **${report.diversity.score}/5** — ${report.diversity.reasoning}`,
  );
  lines.push("");
  lines.push("**Brand voice fit per variant:**");
  for (const v of report.brand_voice_fit) {
    lines.push(
      `- variant #${v.variant_idx}: **${v.score}/5** — ${v.violations.length === 0 ? "no violations" : v.violations.join("; ")}`,
    );
  }
  lines.push("");
  lines.push(`- worst_offender_idx: **${report.worst_offender_idx}**`);
  lines.push(`- top_fix: ${report.top_fix}`);
  return lines.join("\n");
}

function renderLayer3(report: SensitivityReport | { skipped: string }): string {
  const lines: string[] = ["", "## Layer 3 — Scoring sensitivity probe\n"];
  if ("skipped" in report) {
    lines.push(`_Skipped: ${report.skipped}_`);
    return lines.join("\n");
  }
  lines.push(`Total LLM calls: ${report.total_llm_calls}`);
  lines.push("");
  for (const c of report.cases) {
    const emoji = c.flag === "pass" ? "✅" : c.flag === "warn" ? "⚠️" : "❌";
    lines.push(`### Case: \`${c.case_id}\` ${emoji}`);
    lines.push(`Expectation: ${c.expectation}`);
    lines.push("");
    lines.push(
      `| label | mention_rate | avg_position | score |`,
    );
    lines.push(`|---|---|---|---|`);
    lines.push(
      `| ${c.a.label} | ${c.a.mention_rate.toFixed(2)} | ${c.a.avg_position?.toFixed(2) ?? "null"} | ${c.a.score.toFixed(3)} |`,
    );
    lines.push(
      `| ${c.b.label} | ${c.b.mention_rate.toFixed(2)} | ${c.b.avg_position?.toFixed(2) ?? "null"} | ${c.b.score.toFixed(3)} |`,
    );
    lines.push("");
    lines.push(
      `Δscore = ${c.delta_score.toFixed(3)} · Δmention_rate = ${c.delta_mention_rate.toFixed(2)}`,
    );
    lines.push("");
  }
  lines.push(
    report.hypothesis_confirmed
      ? "**Hypothesis CONFIRMED:** at least one contrast pair shows insufficient Δscore — judges are not sufficiently sensitive to variant body. Scoring methodology needs redesign."
      : "**Hypothesis REJECTED:** all contrast pairs show meaningful Δscore — judges respond to body content as intended.",
  );
  return lines.join("\n");
}

function recommendFixes(
  layer1: DiversityReport,
  layer2: JudgeReport | { skipped: string },
  layer3: SensitivityReport | { skipped: string },
): string[] {
  const fixes: string[] = [];

  if (
    layer1.structural_pattern_count >= 2 ||
    layer1.trigram_jaccard_pairwise_avg > 0.3 ||
    layer1.opening_unique_ratio < 1
  ) {
    fixes.push(
      "Rewrite simulator prompt to require ANGLE diversity (e.g. data model vs migration cost vs API ergonomics vs price), not just N variants. Forbid the 'competitor X, but At Attio…' template.",
    );
  }
  const totalForbidden = layer1.forbidden_hits.reduce(
    (a, h) => a + h.matches.length,
    0,
  );
  const totalTropes = layer1.ai_trope_hits.reduce(
    (a, h) => a + h.matches.length,
    0,
  );
  if (totalForbidden + totalTropes > 0) {
    fixes.push(
      `Add a forbidden-phrase post-filter before persist (or inject the list into the simulator prompt as 'NEVER use'). ${totalForbidden} forbidden + ${totalTropes} trope hits this run.`,
    );
  }

  if (!("skipped" in layer3) && layer3.hypothesis_confirmed) {
    fixes.push(
      "Replace the global ranking-prompt scoring with a body-relative metric (e.g. per-variant embedding similarity to brand voice corpus, or ask the judge to RATE the variant directly instead of re-ranking the brand list).",
    );
  }

  if (!("skipped" in layer2) && layer2.top_fix) {
    fixes.push(`Judge-recommended top fix: ${layer2.top_fix}`);
  }

  return fixes;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date();

  console.error(`[evals] starting at ${startedAt.toISOString()}`);
  console.error(`[evals] config:`, args);

  // 1. Load fixture (file or Supabase)
  const fixture: FixtureFile = args.runId
    ? await loadFromSupabase(args.runId)
    : loadFixtureFile(args.fixture);
  console.error(
    `[evals] loaded ${fixture.variants.length} variant(s) from "${fixture.fixture_id}"`,
  );

  // 2. Layer 1 — diversity (always runs, deterministic)
  console.error("[evals] Layer 1: computing diversity metrics…");
  const layer1 = computeDiversity(fixture.variants);

  // 3. Layer 2 — judge (skippable)
  let layer2: JudgeReport | { skipped: string };
  if (args.skipJudge) {
    layer2 = { skipped: "--no-judge flag" };
  } else if (!process.env.ANTHROPIC_API_KEY) {
    layer2 = { skipped: "ANTHROPIC_API_KEY not set" };
    console.warn("[evals] Layer 2 skipped: missing ANTHROPIC_API_KEY");
  } else {
    console.error("[evals] Layer 2: running brand-voice judge (claude-sonnet-4-5)…");
    try {
      layer2 = await runBrandVoiceJudge({
        brand_name: fixture.brand_name,
        variants: fixture.variants,
      });
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[evals] Layer 2 errored: ${msg}`);
      layer2 = { skipped: `runtime error: ${msg}` };
    }
  }

  // 4. Layer 3 — scoring sensitivity probe (skippable)
  let layer3: SensitivityReport | { skipped: string };
  if (args.skipSensitivity) {
    layer3 = { skipped: "--no-sensitivity flag" };
  } else if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    layer3 = {
      skipped: "OPENAI_API_KEY and/or ANTHROPIC_API_KEY not set",
    };
    console.warn(
      "[evals] Layer 3 skipped: missing OPENAI_API_KEY and/or ANTHROPIC_API_KEY",
    );
  } else {
    console.error("[evals] Layer 3: running scoring sensitivity probe (~60 LLM calls)…");
    try {
      const contrast = loadContrastFixtureFile(args.contrastFixture);
      layer3 = await runScoringSensitivity(contrast);
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[evals] Layer 3 errored: ${msg}`);
      layer3 = { skipped: `runtime error: ${msg}` };
    }
  }

  // 5. Build full report
  const top_fixes = recommendFixes(layer1, layer2, layer3);
  const full: FullEvalReport = {
    generated_at: startedAt.toISOString(),
    fixture_id: fixture.fixture_id,
    brand_name: fixture.brand_name,
    layer_1: layer1,
    layer_2: layer2,
    layer_3: layer3,
    top_fixes,
  };

  // 6. Render markdown
  const md = [
    `# BBH W5 evals report — ${startedAt.toISOString()}`,
    "",
    `Fixture: \`${fixture.fixture_id}\` (${fixture.description})`,
    `Brand: **${fixture.brand_name}**`,
    `Variants evaluated: ${fixture.variants.length}`,
    "",
    "---",
    "",
    renderLayer1(layer1),
    renderLayer2(layer2),
    renderLayer3(layer3),
    "",
    "---",
    "",
    "## Recommended next-plan fixes",
    "",
    top_fixes.length === 0
      ? "_No fixes needed — variants pass all checks._"
      : top_fixes.map((f, i) => `${i + 1}. ${f}`).join("\n"),
    "",
    "---",
    "",
    "<details><summary>Raw report JSON</summary>",
    "",
    "```json",
    JSON.stringify(full, null, 2),
    "```",
    "",
    "</details>",
    "",
  ].join("\n");

  // 7. Write report file
  mkdirSync(REPORTS_DIR, { recursive: true });
  const safeStamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const reportPath = resolve(
    REPORTS_DIR,
    `${safeStamp}__${fixture.fixture_id.replace(/[^a-z0-9-]/gi, "-")}.md`,
  );
  writeFileSync(reportPath, md, "utf8");
  console.error(`[evals] wrote report → ${reportPath}`);

  // 8. Print to stdout
  process.stdout.write(md);
}

main().catch((err) => {
  console.error("[evals] fatal:", err);
  process.exit(1);
});
