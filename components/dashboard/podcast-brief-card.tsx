import Link from "next/link";

import { formatRelative } from "@/lib/utils";

export interface PodcastBriefSummary {
  id: string;
  podcast_name: string;
  host_name: string;
  episode_topic: string;
  scheduled_date: string | null;
  judge_score: number | null;
  created_at: string;
}

export function PodcastBriefCard({
  brief,
  brandSlug,
}: {
  brief: PodcastBriefSummary;
  brandSlug: string;
}) {
  const score = brief.judge_score;
  const scoreColor =
    score === null
      ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      : score >= 7
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        : score >= 5
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";

  return (
    <Link
      href={`/demo/${brandSlug}/podcast-brief/${brief.id}`}
      className="block rounded-md border border-border bg-card p-3 text-sm transition-colors hover:bg-muted/40"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{brief.podcast_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            host: {brief.host_name}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${scoreColor}`}
          title={
            score !== null
              ? `Judge ${score}/10`
              : "Pipeline still running or judge step skipped"
          }
        >
          {score !== null ? `${score}/10` : "pending"}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {brief.episode_topic}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        {brief.scheduled_date ? (
          <span className="rounded bg-secondary px-1.5 py-0.5">
            📅 {brief.scheduled_date}
          </span>
        ) : null}
        <span>generated {formatRelative(brief.created_at)}</span>
      </div>
    </Link>
  );
}
