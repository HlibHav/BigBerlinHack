"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type TabKey = "overview" | "signals" | "drafts" | "operations";

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "overview", label: "Overview", icon: "📊" },
  { key: "signals", label: "Signals", icon: "🛰" },
  { key: "drafts", label: "Drafts", icon: "✍" },
  { key: "operations", label: "Operations", icon: "⚙" },
];

const VALID_KEYS = new Set<TabKey>(TABS.map((t) => t.key));

function isTabKey(value: string | null): value is TabKey {
  return value !== null && VALID_KEYS.has(value as TabKey);
}

export function DashboardTabs({
  panels,
  rightSlot,
}: {
  panels: Record<TabKey, ReactNode>;
  rightSlot?: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const initial = useMemo<TabKey>(() => (isTabKey(urlTab) ? urlTab : "overview"), [urlTab]);
  const [active, setActive] = useState<TabKey>(initial);

  // Sync external URL changes (browser back/forward, anchor clicks).
  useEffect(() => {
    if (isTabKey(urlTab) && urlTab !== active) {
      setActive(urlTab);
    } else if (urlTab === null && active !== "overview") {
      setActive("overview");
    }
  }, [urlTab, active]);

  function selectTab(key: TabKey) {
    if (key === active) return;
    setActive(key);
    const params = new URLSearchParams(searchParams.toString());
    if (key === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", key);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <>
      <nav
        className="sticky top-0 z-40 -mx-3 flex flex-wrap items-center gap-2 border-b border-border bg-background/85 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4"
        aria-label="Dashboard sections"
      >
        <ul className="flex flex-1 gap-1 overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <li key={t.key} role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={active === t.key}
                aria-controls={`panel-${t.key}`}
                onClick={() => selectTab(t.key)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active === t.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <span className="mr-1.5" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
              </button>
            </li>
          ))}
        </ul>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </nav>

      {TABS.map((t) => (
        <section
          key={t.key}
          id={`panel-${t.key}`}
          role="tabpanel"
          aria-labelledby={`tab-${t.key}`}
          hidden={active !== t.key}
          className="space-y-4 sm:space-y-6"
        >
          {panels[t.key]}
        </section>
      ))}
    </>
  );
}
