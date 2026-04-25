import { DraftCard } from "./draft-card";

type Draft = {
  id: string;
  signal_id: string | null;
  status: "draft" | "approved" | "rejected" | "published";
  body: string;
  channel_hint: "x" | "linkedin" | "blog" | "multi";
  tone_pillar: string;
  reasoning: string;
  evidence_refs: string[];
  created_at: string;
};

type ContentVariant = {
  id: string;
  parent_counter_draft_id: string;
  channel: "blog" | "x_thread" | "linkedin" | "email";
  title: string | null;
  body: string;
  metadata: unknown;
  status: string;
};

type Signal = {
  id: string;
  severity: "low" | "med" | "high";
  sentiment: "positive" | "neutral" | "negative";
  position: number | null;
  summary: string;
  reasoning: string;
  source_type: "competitor" | "internal" | "external" | "peec_delta";
  source_url: string;
  evidence_refs: string[];
  auto_draft: boolean;
  competitor_id: string | null;
  created_at: string;
};

type NarrativeVariant = {
  id: string;
  simulator_run_id: string;
  seed_signal_id: string | null;
  seed_counter_draft_id: string | null;
  rank: number;
  body: string;
  score: number;
  score_reasoning: string;
  predicted_sentiment: "positive" | "neutral" | "negative";
  avg_position: number | null;
  mention_rate: number;
  evidence_refs: string[];
  created_at: string;
};

export function DraftsQueue({
  drafts,
  contentVariants,
  signalsById,
  narrativeVariantsByDraft,
  organizationId,
  brandSlug,
}: {
  drafts: Draft[];
  contentVariants: ContentVariant[];
  signalsById: Map<string, Signal>;
  narrativeVariantsByDraft: Map<string, NarrativeVariant[]>;
  organizationId: string;
  brandSlug: string;
}) {
  const variantsByDraft = new Map<string, ContentVariant[]>();
  for (const v of contentVariants) {
    const arr = variantsByDraft.get(v.parent_counter_draft_id) ?? [];
    arr.push(v);
    variantsByDraft.set(v.parent_counter_draft_id, arr);
  }

  const pending = drafts.filter((d) => d.status === "draft");
  const decided = drafts.filter((d) => d.status !== "draft");

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Counter-drafts queue ({pending.length} pending)
      </h2>

      {drafts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Жодного counter-draft. High-severity signals автоматично спавнять draft, або жми «Generate
          counter-draft» на med signal.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {pending.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              variants={variantsByDraft.get(d.id) ?? []}
              signal={d.signal_id ? signalsById.get(d.signal_id) ?? null : null}
              narrativeVariants={narrativeVariantsByDraft.get(d.id) ?? []}
              organizationId={organizationId}
              brandSlug={brandSlug}
            />
          ))}
          {decided.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              variants={variantsByDraft.get(d.id) ?? []}
              signal={d.signal_id ? signalsById.get(d.signal_id) ?? null : null}
              narrativeVariants={narrativeVariantsByDraft.get(d.id) ?? []}
              organizationId={organizationId}
              brandSlug={brandSlug}
              decided
            />
          ))}
        </ul>
      )}
    </section>
  );
}
