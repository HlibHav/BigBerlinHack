"use client";

import { useMemo, useState } from "react";

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

// Distinct stroke colors for up to 6 brands у multi-line chart. Self brand —
// emerald (matches existing band color). Competitors — other hues.
const BRAND_COLORS = ["#10b981", "#3b82f6", "#f97316", "#a855f7", "#ec4899", "#eab308"];

type Window = 7 | 30 | 90;

export function BrandHealthHero({
  history,
  brandName,
  competitorHistories,
}: {
  history: Report[]; // newest-first
  brandName: string;
  competitorHistories?: Array<{ brand_name: string; history: Report[] }>;
}) {
  const [showTrends, setShowTrends] = useState(false);
  const [window, setWindow] = useState<Window>(30);

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

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => setShowTrends((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {showTrends ? "▾ Hide trends" : "▸ Show 30-day trends (Attio + competitors)"}
        </button>
        {showTrends ? (
          <div className="flex gap-1.5">
            {([7, 30, 90] as const).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`rounded-full px-2.5 py-0.5 text-xs uppercase tracking-wide transition-colors ${
                  window === w
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:opacity-80"
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showTrends ? (
        <TrendChart
          window={window}
          self={{ brand_name: brandName, history }}
          competitors={competitorHistories ?? []}
        />
      ) : null}
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

/**
 * Multi-line trend chart — Y axis = brand health score (0-100), X axis = date.
 * Self brand colored emerald, competitors get distinct hues. Window selector
 * filters history до останніх N днів.
 */
function TrendChart({
  window,
  self,
  competitors,
}: {
  window: Window;
  self: { brand_name: string; history: Report[] };
  competitors: Array<{ brand_name: string; history: Report[] }>;
}) {
  const series = useMemo(() => {
    const allBrands = [self, ...competitors];
    return allBrands.map((b, i) => {
      const trimmed = b.history.slice(0, window).slice().reverse(); // oldest → newest
      return {
        brand_name: b.brand_name,
        color: BRAND_COLORS[i % BRAND_COLORS.length],
        points: trimmed.map((r) => ({ date: r.date, score: score(r) })),
      };
    });
  }, [self, competitors, window]);

  // Collect unique dates across all brands sorted asc для x-axis.
  const allDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of series) for (const p of s.points) set.add(p.date);
    return Array.from(set).sort();
  }, [series]);

  if (allDates.length < 2) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Need ≥2 days з brand_report data — refresh peec-snapshot.json для більшого діапазону.
      </p>
    );
  }

  const w = 800;
  const h = 180;
  const padX = 40;
  const padY = 16;
  const xStep = (w - padX - 8) / Math.max(1, allDates.length - 1);
  const yScale = (s: number) => padY + (h - padY * 2) * (1 - s / 100);
  const dateIndex = new Map(allDates.map((d, i) => [d, i]));

  return (
    <div className="mt-3 rounded-md border border-border bg-background p-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-44 w-full"
        aria-label={`Brand health ${window}-day trend (${series.length} brands)`}
      >
        {/* Y-axis grid lines at 25/50/75 */}
        {[25, 50, 75].map((v) => (
          <g key={v}>
            <line
              x1={padX}
              x2={w - 8}
              y1={yScale(v)}
              y2={yScale(v)}
              className="stroke-border"
              strokeDasharray="2 2"
              strokeWidth={1}
            />
            <text
              x={padX - 4}
              y={yScale(v) + 3}
              className="fill-muted-foreground text-[9px]"
              textAnchor="end"
            >
              {v}
            </text>
          </g>
        ))}
        {/* X-axis labels (first/last) */}
        <text
          x={padX}
          y={h - 2}
          className="fill-muted-foreground text-[9px]"
          textAnchor="start"
        >
          {allDates[0]}
        </text>
        <text
          x={w - 8}
          y={h - 2}
          className="fill-muted-foreground text-[9px]"
          textAnchor="end"
        >
          {allDates[allDates.length - 1]}
        </text>

        {/* Brand polylines */}
        {series.map((s) => {
          if (s.points.length === 0) return null;
          const pts = s.points
            .map((p) => {
              const xi = dateIndex.get(p.date) ?? 0;
              return `${padX + xi * xStep},${yScale(p.score)}`;
            })
            .join(" ");
          return (
            <g key={s.brand_name}>
              <polyline
                points={pts}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.map((p) => {
                const xi = dateIndex.get(p.date) ?? 0;
                return (
                  <circle
                    key={`${s.brand_name}-${p.date}`}
                    cx={padX + xi * xStep}
                    cy={yScale(p.score)}
                    r={2}
                    fill={s.color}
                  >
                    <title>{`${s.brand_name} · ${p.date} · score ${p.score}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <ul className="mt-2 flex flex-wrap gap-3 text-[11px]">
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          return (
            <li key={s.brand_name} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-3 rounded-sm"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className="font-medium">{s.brand_name}</span>
              {last ? (
                <span className="text-muted-foreground">· score {last.score}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
