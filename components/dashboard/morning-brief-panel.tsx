import { formatRelative } from "@/lib/utils";
import { PlayVoiceBriefButton } from "./play-voice-brief-button";
import { SendBriefButton } from "./send-brief-button";

type Brief = {
  id: string;
  delivery_date: string;
  channel: "slack" | "email";
  recipient: string;
  status: "queued" | "sent" | "failed";
  summary_body: string;
  voice_script: string | null;
  sent_at: string | null;
  error_reason: string | null;
} | null;

const statusColor: Record<string, string> = {
  queued: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function MorningBriefPanel({
  latestBrief,
  organizationId,
  brandSlug,
}: {
  latestBrief: Brief;
  organizationId: string;
  brandSlug: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Morning brief (W6′)
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Daily 8am UTC summary → Slack {latestBrief ? `· ${latestBrief.recipient}` : ""}
          </p>
        </div>
        <SendBriefButton organizationId={organizationId} brandSlug={brandSlug} />
      </div>

      {latestBrief ? (
        <div className="mt-3 rounded-md bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusColor[latestBrief.status]}`}>
              {latestBrief.status}
            </span>
            <span className="text-muted-foreground">
              {latestBrief.delivery_date}
              {latestBrief.sent_at ? ` · sent ${formatRelative(latestBrief.sent_at)}` : ""}
            </span>
          </div>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-xs">{latestBrief.summary_body}</pre>
          <div className="mt-2 flex items-center gap-2">
            <PlayVoiceBriefButton
              deliveryId={latestBrief.id}
              available={Boolean(latestBrief.voice_script)}
            />
            <span className="text-[10px] text-muted-foreground">
              60-90s natural rewrite via Gemini Flash, voiced by Gradium
            </span>
          </div>
          {latestBrief.error_reason ? (
            <p className="mt-2 text-xs text-red-700 dark:text-red-400">
              <strong>Error:</strong> {latestBrief.error_reason}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No briefs sent yet. Trigger «Send brief now».
        </p>
      )}
    </section>
  );
}
