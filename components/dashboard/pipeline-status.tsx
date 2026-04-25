import { formatRelative } from "@/lib/utils";

type Run = {
  function_name: string;
  ok: boolean | null;
  finished_at: string | null;
  started_at: string;
} | null;

type RunsByFn = {
  radar: Run;
  simulator: Run;
  expand: Run;
  brief: Run;
};

const fns: Array<{ key: keyof RunsByFn; label: string; cron?: string }> = [
  { key: "radar", label: "W9 Radar", cron: "every 6h" },
  { key: "simulator", label: "W5 Simulator" },
  { key: "expand", label: "W7 Expand" },
  { key: "brief", label: "W6′ Brief", cron: "daily 08:00 UTC" },
];

function statusFor(run: Run): { dot: string; text: string } {
  if (!run) return { dot: "bg-zinc-300 dark:bg-zinc-700", text: "ще не запускали" };
  if (run.ok === null) return { dot: "bg-amber-500 animate-pulse", text: "running…" };
  if (run.ok) return { dot: "bg-emerald-500", text: `✓ ${run.finished_at ? formatRelative(run.finished_at) : "—"}` };
  return { dot: "bg-red-500", text: `✗ ${run.finished_at ? formatRelative(run.finished_at) : "—"}` };
}

export function PipelineStatus({ runs }: { runs: RunsByFn }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pipeline status
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          ● live
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {fns.map(({ key, label, cron }) => {
          const run = runs[key];
          const s = statusFor(run);
          return (
            <li key={key} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                <span className="text-xs font-semibold">{label}</span>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{s.text}</p>
              {cron ? (
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  cron · {cron}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
