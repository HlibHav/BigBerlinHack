import "server-only";

import bundledSnapshot from "@/data/peec-snapshot.json";
import {
  type PeecAction,
  type PeecBrandReportRow,
  type PeecChat,
  type PeecSnapshotFile,
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
