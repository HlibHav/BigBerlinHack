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

/**
 * Subscribes to INSERT events на ключових таблицях для цього organization_id.
 * На кожен новий row викликає router.refresh() що пере-fetch'ить server component
 * data — UI оновлюється без manual reload. Anonymous Supabase client; покладається
 * на public-demo RLS policy (organizations.is_public_demo=true).
 *
 * Debounce: тригер refresh не частіше ніж раз на 1.5s щоб не спамити при batch'ах.
 */
export function RealtimeRefresher({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const lastRefresh = useRef(0);
  const pending = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`bbh:org:${organizationId}`);

    function scheduleRefresh(label: string) {
      const now = Date.now();
      const since = now - lastRefresh.current;
      const delay = since < 1500 ? 1500 - since : 0;
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        lastRefresh.current = Date.now();
        toast.info(`New ${label}`, { description: "UI оновлюється…", duration: 2500 });
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
        () => scheduleRefresh(tableLabel[table]),
      );
    }

    channel.subscribe();

    return () => {
      if (pending.current) clearTimeout(pending.current);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  return null;
}
