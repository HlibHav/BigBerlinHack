import {
  AnticipatedQASchema,
  BrandDropMomentSchema,
  CompetitorMentionStrategySchema,
  PodcastBriefDimensionsSchema,
  TalkingPointSchema,
  TopicToAvoidSchema,
} from "@/lib/schemas/podcast-brief";
import { z } from "zod";

import { formatRelative } from "@/lib/utils";

import { CopyMarkdownButton } from "./copy-markdown-button";
import { VoicePreviewButton } from "./voice-preview-button";

/**
 * Wide BriefRow shape — what the route's server component selects from
 * podcast_briefs. We accept Json (raw jsonb) for the structured fields and
 * parse them through Zod arrays here so render code is fully typed.
 */
export interface PodcastBriefDetailRow {
  id: string;
  podcast_name: string;
  host_name: string;
  audience: string;
  episode_topic: string;
  scheduled_date: string | null;
  judge_score: number | null;
  judge_reasoning: string | null;
  judge_dimensions: unknown;
  top_fixes: unknown;
  talking_points: unknown;
  anticipated_qa: unknown;
  brand_drop_moments: unknown;
  topics_to_avoid: unknown;
  competitor_mention_strategy: unknown;
  markdown_brief: string;
  created_at: string;
}

const TopFixesSchema = z.array(z.string()).default([]);

export function PodcastBriefDetail({
  brief,
  brandSlug,
}: {
  brief: PodcastBriefDetailRow;
  brandSlug: string;
}) {
  const talkingPoints = z.array(TalkingPointSchema).safeParse(brief.talking_points);
  const qa = z.array(AnticipatedQASchema).safeParse(brief.anticipated_qa);
  const drops = z
    .array(BrandDropMomentSchema)
    .safeParse(brief.brand_drop_moments);
  const avoid = z.array(TopicToAvoidSchema).safeParse(brief.topics_to_avoid);
  const competitor = z
    .array(CompetitorMentionStrategySchema)
    .safeParse(brief.competitor_mention_strategy);
  const dims = PodcastBriefDimensionsSchema.safeParse(brief.judge_dimensions);
  const fixes = TopFixesSchema.safeParse(brief.top_fixes);

  return (
    <article className="mx-auto w-full max-w-2xl space-y-5 px-3 py-4 sm:px-5">
      <header className="space-y-1.5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          <a
            href={`/demo/${brandSlug}?tab=podcast-prep`}
            className="hover:underline"
          >
            ← back to briefs
          </a>
        </p>
        <h1 className="text-xl font-semibold leading-tight">
          {brief.podcast_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          host <span className="font-medium">{brief.host_name}</span> ·{" "}
          generated {formatRelative(brief.created_at)}
          {brief.scheduled_date ? (
            <>
              {" · "}
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                📅 {brief.scheduled_date}
              </span>
            </>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">audience:</span> {brief.audience}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">topic:</span> {brief.episode_topic}
        </p>
      </header>

      <JudgeBlock
        score={brief.judge_score}
        reasoning={brief.judge_reasoning}
        dimensions={dims.success ? dims.data : null}
        topFixes={fixes.success ? fixes.data : []}
      />

      <Section title="Talking points">
        {talkingPoints.success ? (
          <ol className="space-y-3">
            {talkingPoints.data.map((t, i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-card p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold leading-snug">
                    {i + 1}. {t.headline}
                  </p>
                  <span
                    className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    title={t.retrievability_reasoning}
                  >
                    retrievability {t.retrievability_score}/10
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium">Proof:</span> {t.proof_point}
                </p>
                <p className="mt-1 text-sm leading-relaxed">
                  {t.suggested_phrasing}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground">
                    ↳ maps to AI prompt:{" "}
                    <code className="rounded bg-secondary px-1 py-0.5">
                      {t.maps_to_prompt}
                    </code>
                  </p>
                  <VoicePreviewButton
                    brandSlug={brandSlug}
                    text={t.suggested_phrasing}
                  />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <ParseError name="talking points" />
        )}
      </Section>

      <Section title="Anticipated Q&A">
        {qa.success ? (
          <ol className="space-y-3">
            {qa.data.map((q, i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-card p-3"
              >
                <p className="font-semibold leading-snug">
                  Q{i + 1}. {q.question}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed">
                  {q.suggested_answer}
                </p>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">
                    Why host might ask + pitfall
                  </summary>
                  <p className="mt-1">
                    <span className="font-medium">Why:</span> {q.why_host_asks}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">Pitfall:</span> {q.pitfall}
                  </p>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <ParseError name="anticipated Q&A" />
        )}
      </Section>

      <Section title="Brand-drop moments">
        {drops.success ? (
          <ul className="space-y-2">
            {drops.data.map((d, i) => (
              <li key={i} className="rounded-md border border-border bg-card p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Trigger
                </p>
                <p className="mt-1 text-sm">{d.trigger}</p>
                <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Suggested mention
                </p>
                <p className="mt-1 text-sm font-medium">{d.suggested_mention}</p>
                <p className="mt-1 text-xs italic text-muted-foreground">
                  ↳ {d.specificity_boost}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <ParseError name="brand-drop moments" />
        )}
      </Section>

      <Section title="Topics to avoid">
        {avoid.success ? (
          <ul className="space-y-2">
            {avoid.data.map((a, i) => (
              <li key={i} className="rounded-md border border-border bg-card p-3">
                <p className="font-semibold leading-snug">⚠ {a.topic}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium">Risk:</span> {a.risk}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-medium">Pivot:</span> {a.pivot}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <ParseError name="topics to avoid" />
        )}
      </Section>

      <Section title="Competitor mention strategy">
        {competitor.success ? (
          competitor.data.length > 0 ? (
            <ol className="space-y-3">
              {competitor.data.map((c, i) => (
                <li
                  key={i}
                  className="rounded-md border border-border bg-card p-3"
                >
                  <p className="font-semibold leading-snug">
                    {i + 1}. {c.competitor_name}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    <span className="font-medium">OK to name:</span>{" "}
                    {c.when_ok_to_name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium">Use generic:</span>{" "}
                    {c.when_use_generic}
                  </p>
                  <p className="mt-1 text-xs">
                    <span className="font-medium">Generic phrasings:</span>{" "}
                    {c.suggested_generic_phrasing.map((p, j) => (
                      <span
                        key={j}
                        className="ml-1 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px]"
                      >
                        &ldquo;{p}&rdquo;
                      </span>
                    ))}
                  </p>
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    risk if mishandled: {c.risk_if_mishandled}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs italic text-muted-foreground">
              No top competitors flagged — Peec snapshot returned 0 competitors
              with recent signal frequency.
            </p>
          )
        ) : (
          <ParseError name="competitor mention strategy" />
        )}
      </Section>

      <details className="rounded-md border border-border bg-muted/30 p-3 text-xs">
        <summary className="cursor-pointer font-semibold hover:text-foreground">
          Raw markdown (copy / download)
        </summary>
        <div className="mt-2 flex justify-end">
          <CopyMarkdownButton markdown={brief.markdown_brief} />
        </div>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px]">
          {brief.markdown_brief}
        </pre>
      </details>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function JudgeBlock({
  score,
  reasoning,
  dimensions,
  topFixes,
}: {
  score: number | null;
  reasoning: string | null;
  dimensions: {
    retrievability: number;
    naturality: number;
    specificity: number;
    coverage: number;
  } | null;
  topFixes: string[];
}) {
  if (score === null) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/20">
        Judge step did not produce a verdict — pipeline may still be running or
        encountered an error. Refresh shortly.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Judge verdict
          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {score}/10
          </span>
        </h2>
        {dimensions ? (
          <div className="flex gap-2 font-mono text-[10px] text-muted-foreground">
            <span title="retrievability">retr {dimensions.retrievability}</span>
            <span title="naturality">nat {dimensions.naturality}</span>
            <span title="specificity">spc {dimensions.specificity}</span>
            <span title="coverage">cov {dimensions.coverage}</span>
          </div>
        ) : null}
      </div>
      {reasoning ? (
        <p className="mt-2 text-sm leading-relaxed">{reasoning}</p>
      ) : null}
      {topFixes.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Top fixes before recording
          </p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs">
            {topFixes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function ParseError({ name }: { name: string }) {
  return (
    <p className="text-xs italic text-red-700 dark:text-red-300">
      ⚠ Stored {name} failed schema validation — manual inspection needed.
    </p>
  );
}
