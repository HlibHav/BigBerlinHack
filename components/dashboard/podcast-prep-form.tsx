"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { triggerPodcastPrep } from "@/app/actions/podcast-prep";
import { PodcastPrepRequestSchema } from "@/lib/schemas/podcast-brief";

interface Props {
  organizationId: string;
  /** Defaults provided so the form can be opened, filled and submitted in 30s. */
  defaults?: {
    podcast_name?: string;
    host_name?: string;
    audience?: string;
    episode_topic?: string;
  };
}

const MAX_PREVIOUS_URLS = 3;

export function PodcastPrepForm({ organizationId, defaults }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [podcastName, setPodcastName] = useState(defaults?.podcast_name ?? "");
  const [hostName, setHostName] = useState(defaults?.host_name ?? "");
  const [audience, setAudience] = useState(defaults?.audience ?? "");
  const [episodeTopic, setEpisodeTopic] = useState(
    defaults?.episode_topic ?? "",
  );
  const [scheduledDate, setScheduledDate] = useState("");
  const [previousUrls, setPreviousUrls] = useState<string[]>([""]);

  function updateUrl(index: number, value: string) {
    setPreviousUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function addUrl() {
    setPreviousUrls((prev) =>
      prev.length >= MAX_PREVIOUS_URLS ? prev : [...prev, ""],
    );
  }

  function removeUrl(index: number) {
    setPreviousUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function reset() {
    setPodcastName("");
    setHostName("");
    setAudience("");
    setEpisodeTopic("");
    setScheduledDate("");
    setPreviousUrls([""]);
    setOpen(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      organization_id: organizationId,
      podcast_name: podcastName.trim(),
      host_name: hostName.trim(),
      audience: audience.trim(),
      episode_topic: episodeTopic.trim(),
      previous_episode_urls: previousUrls
        .map((u) => u.trim())
        .filter((u) => u.length > 0),
      scheduled_date: scheduledDate.trim() || null,
      requested_by: null,
    };

    // Defense-in-depth: schema parse client-side for UX feedback before round trip.
    const parsed = PodcastPrepRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      toast.error("Form invalid", {
        description: `${issue.path.join(".")}: ${issue.message}`,
      });
      return;
    }

    const t = toast.loading("Generating podcast brief…", {
      description: "W11 pipeline runs ~60s — brief will appear in the list",
    });
    startTransition(async () => {
      try {
        const result = await triggerPodcastPrep(parsed.data);
        if (result.ok) {
          toast.success("Brief generation triggered", {
            id: t,
            description:
              "Refresh the page or open the detail view once the brief shows up below",
          });
          reset();
        } else {
          toast.error("Trigger failed", {
            id: t,
            description: result.reason ?? "event API error",
          });
        }
      } catch (err) {
        toast.error("Trigger failed", {
          id: t,
          description: err instanceof Error ? err.message : "unknown",
        });
      }
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        className="self-start"
      >
        🎙 New podcast brief
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border border-border bg-card p-3 text-sm"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Podcast name *" htmlFor="pp-name">
          <input
            id="pp-name"
            value={podcastName}
            onChange={(e) => setPodcastName(e.target.value)}
            required
            minLength={2}
            maxLength={200}
            placeholder="Lenny's Podcast"
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Host name *" htmlFor="pp-host">
          <input
            id="pp-host"
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            required
            minLength={2}
            maxLength={200}
            placeholder="Lenny Rachitsky"
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
          />
        </Field>
      </div>
      <Field label="Audience *" htmlFor="pp-audience">
        <textarea
          id="pp-audience"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          required
          minLength={10}
          maxLength={500}
          rows={2}
          placeholder="Senior PMs at PLG companies, ~10k weekly listeners, mostly US/UK"
          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
        />
      </Field>
      <Field label="Episode topic *" htmlFor="pp-topic">
        <textarea
          id="pp-topic"
          value={episodeTopic}
          onChange={(e) => setEpisodeTopic(e.target.value)}
          required
          minLength={10}
          maxLength={500}
          rows={2}
          placeholder="How AI is reshaping CRM workflows in modern B2B SaaS"
          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
        />
      </Field>
      <Field
        label={`Previous episode URLs (optional, ≤${MAX_PREVIOUS_URLS}) — for tone calibration`}
        htmlFor="pp-url-0"
      >
        <div className="space-y-1.5">
          {previousUrls.map((u, i) => (
            <div key={i} className="flex gap-2">
              <input
                id={i === 0 ? "pp-url-0" : undefined}
                type="url"
                value={u}
                onChange={(e) => updateUrl(i, e.target.value)}
                placeholder="https://www.lennyspodcast.com/episodes/…"
                className="flex-1 rounded border border-input bg-background px-2 py-1.5 text-xs"
              />
              {previousUrls.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeUrl(i)}
                  className="rounded border border-border px-2 text-xs text-muted-foreground hover:bg-secondary"
                  aria-label="Remove URL"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
          {previousUrls.length < MAX_PREVIOUS_URLS ? (
            <button
              type="button"
              onClick={addUrl}
              className="text-xs text-primary hover:underline"
            >
              + add another URL
            </button>
          ) : null}
        </div>
      </Field>
      <Field label="Scheduled date (optional)" htmlFor="pp-date">
        <input
          id="pp-date"
          type="date"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
          className="rounded border border-input bg-background px-2 py-1.5 text-sm"
        />
      </Field>
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Triggering…" : "Generate brief"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={reset}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
