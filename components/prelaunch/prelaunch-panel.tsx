import { PrelaunchForm } from "./prelaunch-form";
import {
  PrelaunchResultCard,
  type PrelaunchCheckRow,
} from "./prelaunch-result-card";

export function PrelaunchPanel({
  organizationId,
  brandSlug,
  brandName,
  checks,
}: {
  organizationId: string;
  brandSlug: string;
  brandName: string;
  checks: PrelaunchCheckRow[];
}) {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Pre-Launch Check · {brandName}</h2>
        <p className="text-sm text-muted-foreground">
          Перед launch-ом нової фрази перевір: чи фраза вже зайнята competitor-ами,
          як LLMs її ранкують проти Peec landscape, і чи варто запускати взагалі.
          Pipeline: Peec baseline → Tavily availability + news (30d) → LLM panel
          (gpt-4o-mini + claude-haiku-4-5) → Claude Sonnet verdict.
        </p>
      </header>

      <PrelaunchForm organizationId={organizationId} brandSlug={brandSlug} />

      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          History · last {checks.length} {checks.length === 1 ? "check" : "checks"}
        </h3>
        {checks.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            Жодного pre-launch check ще не запускався. Введи draft phrasing вище —
            отримаєш verdict за ~60s.
          </p>
        ) : (
          <ul className="space-y-2">
            {checks.map((c) => (
              <PrelaunchResultCard key={c.id} check={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
