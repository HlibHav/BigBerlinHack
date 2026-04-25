type Variant = {
  id: string;
  simulator_run_id: string;
  rank: number;
  body: string;
  score: number;
  score_reasoning: string;
  predicted_sentiment: "positive" | "neutral" | "negative";
  avg_position: number | null;
  mention_rate: number;
  evidence_refs: string[];
};

const sentimentEmoji: Record<string, string> = {
  positive: "🙂",
  neutral: "😐",
  negative: "🙁",
};

export function SimulatorOutputs({ variants }: { variants: Variant[] }) {
  if (variants.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card/50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ad-hoc simulator runs
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Симуляції прив&apos;язані до draft видно inline на цій же сторінці.
          Тут будуть тільки ad-hoc прогони (без draft seed).
        </p>
      </section>
    );
  }

  // Group by simulator_run_id, show latest only
  const byRun = new Map<string, Variant[]>();
  for (const v of variants) {
    const arr = byRun.get(v.simulator_run_id) ?? [];
    arr.push(v);
    byRun.set(v.simulator_run_id, arr);
  }
  const latestRunId = variants[0].simulator_run_id;
  const latest = (byRun.get(latestRunId) ?? []).sort((a, b) => a.rank - b.rank);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Simulator outputs — ranked variants
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Latest run · {latest.length} variants tested across 5 prompts × 2 models.
      </p>

      <ol className="mt-3 space-y-2">
        {latest.map((v) => (
          <li key={v.id} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  #{v.rank}
                </span>
                <span className="text-sm font-medium">score {v.score.toFixed(3)}</span>
                <span title={`predicted sentiment: ${v.predicted_sentiment}`}>
                  {sentimentEmoji[v.predicted_sentiment]}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                mention {(v.mention_rate * 100).toFixed(0)}% · pos{" "}
                {v.avg_position !== null ? v.avg_position.toFixed(1) : "—"}
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{v.body}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Why this score:</strong> {v.score_reasoning}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
