/**
 * One-shot dedup script for legacy peec_delta signals.
 *
 * Background: an earlier version of `inngest/functions/competitor-radar.ts`
 * keyed dedup on `${source_url}|${summary}`. When the summary template was
 * edited (e.g. fixing a Ukrainian "y" → English "in" leak), the same
 * (competitor, Peec prompt URL) would re-fire under a slightly different
 * string and persist as a separate row. Result: the dashboard shows the
 * same competitor mentioned in the same prompt twice, hours apart.
 *
 * The new dedup key is `${source_url}|${competitor_id}` — stable across
 * phrasing edits. This script applies the same rule retroactively: for each
 * (organization_id, competitor_id, source_url) where source_type='peec_delta'
 * and ≥2 rows exist, keep the most recent and delete the rest.
 *
 * Usage:
 *   pnpm tsx scripts/dedup-peec-signals.ts          # dry-run, prints what would be deleted
 *   pnpm tsx scripts/dedup-peec-signals.ts --apply  # actually delete
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local (already
 * present for the Inngest functions to write to the DB).
 */

import { createClient } from "@supabase/supabase-js";

type Row = {
  id: string;
  organization_id: string;
  competitor_id: string | null;
  source_url: string;
  source_type: string;
  summary: string;
  created_at: string;
};

async function main() {
  const apply = process.argv.includes("--apply");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "[dedup] missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — set in .env.local",
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pull every peec_delta signal across all orgs. The table is small (~10k
  // rows even on a busy hackathon brand) so a single SELECT is fine.
  const { data, error } = await supabase
    .from("signals")
    .select("id, organization_id, competitor_id, source_url, source_type, summary, created_at")
    .eq("source_type", "peec_delta")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[dedup] select failed:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as Row[];
  console.log(`[dedup] fetched ${rows.length} peec_delta signals`);

  // Bucket by (org, competitor_id, source_url). First row in each bucket is
  // the newest (because we ordered DESC). Everything after = stale duplicate.
  const buckets = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${row.organization_id}|${row.competitor_id ?? ""}|${row.source_url}`;
    const arr = buckets.get(key) ?? [];
    arr.push(row);
    buckets.set(key, arr);
  }

  const toDelete: Row[] = [];
  let bucketsWithDupes = 0;
  for (const arr of buckets.values()) {
    if (arr.length <= 1) continue;
    bucketsWithDupes += 1;
    // Keep newest (arr[0]), delete the rest.
    toDelete.push(...arr.slice(1));
  }

  console.log(
    `[dedup] ${bucketsWithDupes} buckets have duplicates; ${toDelete.length} rows to delete`,
  );

  if (toDelete.length === 0) {
    console.log("[dedup] nothing to do — peec_delta signals already deduped");
    return;
  }

  // Show a sample so the operator can sanity-check.
  console.log("[dedup] sample of rows to delete (first 5):");
  for (const r of toDelete.slice(0, 5)) {
    console.log(
      `  - ${r.id.slice(0, 8)}…  org=${r.organization_id.slice(0, 8)}…  comp=${(r.competitor_id ?? "—").slice(0, 8)}  url=${r.source_url.slice(-40)}  created=${r.created_at}`,
    );
  }

  if (!apply) {
    console.log("\n[dedup] dry-run — pass --apply to actually delete");
    return;
  }

  // Delete in batches of 500 to stay under PostgREST query-string limits.
  const ids = toDelete.map((r) => r.id);
  const BATCH = 500;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const { error: delErr, count } = await supabase
      .from("signals")
      .delete({ count: "exact" })
      .in("id", slice);
    if (delErr) {
      console.error(`[dedup] batch ${i / BATCH} failed:`, delErr.message);
      process.exit(1);
    }
    deleted += count ?? 0;
    console.log(`[dedup] deleted batch ${i / BATCH + 1} (${count ?? 0} rows)`);
  }
  console.log(`[dedup] done — deleted ${deleted} rows total`);
}

main().catch((err) => {
  console.error("[dedup] uncaught:", err);
  process.exit(1);
});
