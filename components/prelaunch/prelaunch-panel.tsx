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
          Before launching a new phrase, check whether it&apos;s already taken by competitors,
          how LLMs rank it against the Peec landscape, and whether it&apos;s worth launching at all.
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
            No pre-launch checks yet. Enter a draft phrasing above — you&apos;ll get a verdict in ~60s.
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
