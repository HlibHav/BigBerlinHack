type Competitor = {
  id: string;
  display_name: string;
  relationship: string;
  homepage_url: string | null;
  handles: unknown;
  is_active: boolean;
};

export function CompetitorsPanel({ competitors }: { competitors: Competitor[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tracked brands ({competitors.length})
        </h2>
        <span
          className="cursor-help text-xs text-muted-foreground"
          title="Add competitor — coming v2 (currently seeded via supabase/seed.sql)"
        >
          + Add competitor (v2)
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {competitors.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-md border border-border bg-background p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{c.display_name}</p>
              {c.homepage_url ? (
                <a
                  href={c.homepage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-xs text-muted-foreground hover:underline"
                >
                  {c.homepage_url.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                c.relationship === "self"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {c.relationship}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
