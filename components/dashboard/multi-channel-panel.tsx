type ContentVariant = {
  id: string;
  parent_counter_draft_id: string;
  channel: "blog" | "x_thread" | "linkedin" | "email";
  title: string | null;
  body: string;
  status: string;
};

type Draft = { id: string; body: string };

const channelLabel: Record<string, string> = {
  blog: "📝 Blog",
  x_thread: "🐦 X thread",
  linkedin: "💼 LinkedIn",
  email: "📧 Email",
};

export function MultiChannelPanel({
  contentVariants,
  drafts,
}: {
  contentVariants: ContentVariant[];
  drafts: Draft[];
}) {
  if (contentVariants.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Multi-channel content variants (W7)
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Approve a counter-draft → 4 channel variants (blog / X thread / LinkedIn / email) auto-generate тут.
        </p>
      </section>
    );
  }

  // Group by parent draft, take last 1 group
  const draftIds = Array.from(new Set(contentVariants.map((v) => v.parent_counter_draft_id)));
  const lastDraftId = draftIds[0];
  const variants = contentVariants.filter((v) => v.parent_counter_draft_id === lastDraftId);
  const parentDraft = drafts.find((d) => d.id === lastDraftId);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Multi-channel content variants (W7)
      </h2>
      {parentDraft ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          From counter-draft: {parentDraft.body.slice(0, 120)}…
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {variants.map((v) => (
          <article key={v.id} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{channelLabel[v.channel] ?? v.channel}</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                {v.status}
              </span>
            </div>
            {v.title ? <p className="mt-1 text-sm font-medium">{v.title}</p> : null}
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">
              {v.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
