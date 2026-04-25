"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const TABLES = ["runs", "signals", "counter_drafts", "narrative_variants", "content_variants", "brief_deliveries"] as const;

const tableLabel: Record<(typeof TABLES)[number], string> = {
  runs: "pipeline run",
  signals: "signal",
  counter_drafts: "counter-draft",
  narrative_variants: "narrative variant",
  content_variants: "content variant",
  brief_deliveries: "morning brief",
};

const POLL_INTERVAL_MS = 20_000;
const MIN_REFRESH_GAP_MS = 1500;

/**
 * Hybrid auto-refresh:
 * - Realtime subscription: INSERT на ключових таблицях для цього org → debounced refresh.
 * - Polling fallback: кожні 20s викликає refresh навіть якщо Realtime не enabled
 *   на Supabase tables (потребує `alter publication supabase_realtime add table`).
 *   Гарантує auto-refresh для simulator/expand outputs незалежно від Supabase config.
 *
 * Anonymous Supabase client; полагається на public-demo RLS policy.
 */
export function RealtimeRefresher({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const lastRefresh = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasShownConnect = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`bbh:org:${organizationId}`);

    function doRefresh(label?: string) {
      const now = Date.now();
      const since = now - lastRefresh.current;
      const delay = since < MIN_REFRESH_GAP_MS ? MIN_REFRESH_GAP_MS - since : 0;
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        lastRefresh.current = Date.now();
        if (label) {
          toast.info(`New ${label}`, { description: "UI оновлюється…", duration: 2500 });
        }
        router.refresh();
      }, delay);
    }

    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table,
          filter: `organization_id=eq.${organizationId}`,
        },
        () => doRefresh(tableLabel[table]),
      );
    }

    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        // eslint-disable-next-line no-console
        console.log("[Realtime] connected for org", organizationId);
        if (!hasShownConnect.current) {
          toast.success("Live updates active", { duration: 2500 });
          hasShownConnect.current = true;
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // eslint-disable-next-line no-console
        console.warn("[Realtime] subscription degraded:", status, err);
        if (!hasShownConnect.current && status !== "CLOSED") {
          toast.warning("Live updates unavailable", {
            duration: 4000,
            description: "Polling fallback active (refresh кожні 20s)",
          });
        }
      }
    });

    // Polling fallback — silent refresh кожні 20s. router.refresh() переmounts
    // тільки змінені server components, не повний reload.
    const pollId = setInterval(() => doRefresh(), POLL_INTERVAL_MS);

    return () => {
      if (pending.current) clearTimeout(pending.current);
      clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  return null;
}
