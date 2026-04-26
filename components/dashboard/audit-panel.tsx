import { formatRelative } from "@/lib/utils";
import { RunRadarButton } from "./run-radar-button";

type Run = {
  id: string;
  function_name: string;
  ok: boolean | null;
  stats: unknown;
  started_at: string;
  finished_at: string | null;
} | null;

type RadarStats = {
  function_name?: string;
  duration_seconds?: number;
  sources_scanned?: number;
  signals_total?: number;
  signals_by_severity?: { high: number; med: number; low: number };
  drafts_generated?: number;
  cost_usd_cents?: number;
};

function formatCost(cents?: number): string {
  if (cents === undefined || cents === null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function AuditPanel({
  organizationId,
  brandSlug,
  latestRun,
}: {
  organizationId: string;
  brandSlug: string;
  latestRun: Run;
}) {
  const stats = (latestRun?.stats as RadarStats | null) ?? null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Last radar run
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {latestRun?.finished_at
              ? `${formatRelative(latestRun.finished_at)} · ${stats?.duration_seconds ?? "?"}s`
              : "never run"}
          </p>
        </div>
        <RunRadarButton organizationId={organizationId} brandSlug={brandSlug} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Sources" value={stats?.sources_scanned ?? "—"} />
        <Stat label="Signals" value={stats?.signals_total ?? "—"} />
        <Stat
          label="Severity"
          value={
            stats?.signals_by_severity
              ? `H${stats.signals_by_severity.high}/M${stats.signals_by_severity.med}/L${stats.signals_by_severity.low}`
              : "—"
          }
        />
        <Stat label="Drafts" value={stats?.drafts_generated ?? "—"} />
        <Stat label="Cost" value={formatCost(stats?.cost_usd_cents)} accent />
      </dl>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-lg font-semibold ${accent ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
