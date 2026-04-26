import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

export type CostService =
  | "openai"
  | "anthropic"
  | "gemini"
  | "gradium"
  | "peec"
  | "tavily"
  | "firecrawl"
  | "telli"
  | "elevenlabs";

export interface RecordCostInput {
  organization_id: string;
  service: CostService;
  operation: string;
  usd_cents: number;
  tokens_or_units?: number | null;
  run_id?: string | null;
}

/**
 * Append a row to `cost_ledger`. Called from EVERY external API wrapper
 * (Tavily, OpenAI, Anthropic). Peec is local file — no cost row.
 *
 * Failure mode: we log but never throw — billing must not break user flow.
 * The audit run will surface missing rows during Gate B review.
 *
 * Note: `cost_ledger` lives in supabase/migrations/* — the generated
 * `Database` types stub here is empty until the migrations agent runs
 * `pnpm types:gen`. The cast keeps the wrapper compiling now without
 * lying about the row shape (DDL is authoritative in CONTRACTS.md §3.3).
 */
export async function recordCost(input: RecordCostInput): Promise<void> {
  const supabase = createServiceClient();
  // TODO(types): drop the `as any` cast once `pnpm types:gen` re-emits
  // `lib/supabase/types.ts` against the migrations that include cost_ledger.
  const { error } = await (supabase as any).from("cost_ledger").insert({
    organization_id: input.organization_id,
    service: input.service,
    operation: input.operation,
    usd_cents: Math.max(0, Math.round(input.usd_cents)),
    tokens_or_units: input.tokens_or_units ?? null,
    run_id: input.run_id ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[cost.recordCost] insert failed", {
      service: input.service,
      operation: input.operation,
      error: error.message,
    });
  }
}

/**
 * Sum all `usd_cents` for a given run. Used by the `persist-run` Inngest step
 * — Inngest steps are isolated processes, so we ALWAYS query the DB rather
 * than relying on a JS closure that won't survive step boundaries.
 */
export async function sumRunCost(run_id: string): Promise<number> {
  const supabase = createServiceClient();
  // TODO(types): drop cast once `pnpm types:gen` runs after migrations land.
  const { data, error } = await (supabase as any)
    .from("cost_ledger")
    .select("usd_cents")
    .eq("run_id", run_id);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[cost.sumRunCost] query failed", { run_id, error: error.message });
    return 0;
  }
  if (!data) return 0;
  return (data as Array<{ usd_cents: number | null }>).reduce(
    (acc, row) => acc + (row.usd_cents ?? 0),
    0,
  );
}
