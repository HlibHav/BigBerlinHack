type CostRow = {
  service: string;
  usd_cents: number;
};

const serviceLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  tavily: "Tavily",
  peec: "Peec",
  resend: "Resend",
};

function formatCost(cents: number): string {
  if (cents === 0) return "$0.00";
  if (cents < 100) return `$${(cents / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

export function CostPanel({ rows }: { rows: CostRow[] }) {
  // Aggregate per service
  const byService = new Map<string, number>();
  for (const r of rows) {
    byService.set(r.service, (byService.get(r.service) ?? 0) + r.usd_cents);
  }
  const total = Array.from(byService.values()).reduce((acc, c) => acc + c, 0);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Today&apos;s spend
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            External API calls (OpenAI / Anthropic / Tavily) у поточному UTC дні.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tracking-tight">{formatCost(total)}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {rows.length} calls
          </p>
        </div>
      </div>

      {byService.size === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Жодного external API call сьогодні. Тригни «Run radar now» — побачиш cost breakdown.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from(byService.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([service, cents]) => (
              <li key={service} className="rounded-md border border-border bg-background p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {serviceLabel[service] ?? service}
                </p>
                <p className="mt-0.5 text-base font-semibold">{formatCost(cents)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {((cents / total) * 100).toFixed(0)}% of total
                </p>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
