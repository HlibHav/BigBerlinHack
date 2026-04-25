export type Report = {
  date: string;
  visibility: number;
  share_of_voice: number;
  sentiment: "positive" | "neutral" | "negative";
  position: number | null;
};

const sentimentNum: Record<Report["sentiment"], number> = {
  positive: 0.85,
  neutral: 0.5,
  negative: 0.15,
};

export function score(r: Report): number {
  // 0-100. Composite: visibility 40% + sentiment 40% + position bonus 20%.
  const visPart = r.visibility * 40;
  const sentPart = sentimentNum[r.sentiment] * 40;
  // position 1 = best (10/10 → 20pts), position 10+ = 0pts.
  const posPart = r.position !== null ? Math.max(0, ((10 - r.position) / 9) * 20) : 10;
  return Math.round(visPart + sentPart + posPart);
}

export function bandColor(s: number): string {
  if (s >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (s >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function bandLabel(s: number): string {
  if (s >= 85) return "Excellent";
  if (s >= 70) return "Strong";
  if (s >= 55) return "Solid";
  if (s >= 40) return "Watch";
  return "Critical";
}

export function BrandHealthHero({
  history,
  brandName,
}: {
  history: Report[]; // newest-first
  brandName: string;
}) {
  if (history.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card/50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Brand health
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Жодного Peec brand_report для {brandName}. Refresh peec-snapshot.json через MCP.
        </p>
      </section>
    );
  }

  const latest = history[0];
  const previous = history[1] ?? null;
  const currentScore = score(latest);
  const previousScore = previous ? score(previous) : null;
  const delta = previousScore !== null ? currentScore - previousScore : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Brand Health Score
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Composite: visibility · sentiment · position. Source: Peec snapshot ·{" "}
            <span className="font-mono">{latest.date}</span>
          </p>
        </div>
        <div className="flex items-baseline gap-3">
          <span className={`text-5xl font-bold tracking-tight ${bandColor(currentScore)}`}>
            {currentScore}
          </span>
          <div className="flex flex-col">
            <span className={`text-sm font-semibold ${bandColor(currentScore)}`}>
              {bandLabel(currentScore)}
            </span>
            {delta !== null ? (
              <span
                className={`text-xs font-medium ${
                  delta > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : delta < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                }`}
              >
                {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta)} vs {previous?.date}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">no prior data</span>
            )}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
        <Stat label="Visibility" value={`${(latest.visibility * 100).toFixed(0)}%`} />
        <Stat label="Share of voice" value={`${(latest.share_of_voice * 100).toFixed(0)}%`} />
        <Stat label="Sentiment" value={latest.sentiment} />
        <Stat
          label="Avg position"
          value={latest.position !== null ? latest.position.toFixed(1) : "—"}
        />
      </dl>

      {history.length > 1 ? <Sparkline series={history.slice().reverse().map(score)} /> : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold capitalize">{value}</dd>
    </div>
  );
}

export function BrandHealthMini({ history }: { history: Report[] }) {
  if (history.length === 0) return null;
  const latest = history[0];
  const previous = history[1] ?? null;
  const currentScore = score(latest);
  const previousScore = previous ? score(previous) : null;
  const delta = previousScore !== null ? currentScore - previousScore : null;

  return (
    <a
      href="?tab=overview"
      className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-secondary"
      title={`Brand Health Score · ${latest.date}`}
    >
      <span className={bandColor(currentScore)}>{currentScore}</span>
      {delta !== null && delta !== 0 ? (
        <span
          className={`text-[10px] ${
            delta > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {delta > 0 ? "▲" : "▼"}
          {Math.abs(delta)}
        </span>
      ) : null}
    </a>
  );
}

function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const w = 600;
  const h = 32;
  const min = Math.min(...series, 0);
  const max = Math.max(...series, 100);
  const range = Math.max(1, max - min);
  const step = w / (series.length - 1);
  const points = series
    .map((s, i) => `${i * step},${h - ((s - min) / range) * h}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="mt-3 h-8 w-full text-emerald-500"
      aria-label={`Brand health sparkline last ${series.length} days`}
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
