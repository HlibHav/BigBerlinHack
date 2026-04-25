import { describe, it, expect } from "vitest";

import { MorningBriefSchema } from "@/lib/schemas/morning-brief";

describe("MorningBriefSchema", () => {
  it("parses valid Slack-flavored brief з brand_pulse", () => {
    const parsed = MorningBriefSchema.parse({
      delivery_date: "2026-04-25",
      summary_body:
        "## Daily brief\n\nAttio visibility steady at 67%. One high-severity signal flagged from HubSpot launch.",
      signal_count: 5,
      severity_breakdown: { high: 1, med: 2, low: 2 },
      drafts_pending: 1,
      brand_pulse: {
        visibility_pct: 67,
        avg_position: 2.1,
        sentiment_mix: { positive_pct: 60, neutral_pct: 30, negative_pct: 10 },
      },
      evidence_refs: ["peec-snapshot:2026-04-25T07:00:00.000Z"],
    });
    expect(parsed.delivery_date).toBe("2026-04-25");
    expect(parsed.brand_pulse?.visibility_pct).toBe(67);
  });

  it("accepts brand_pulse=null коли no Peec data yet", () => {
    const parsed = MorningBriefSchema.parse({
      delivery_date: "2026-04-25",
      summary_body: "Nothing to report yet — Peec snapshot empty for this brand.".padEnd(60, "."),
      signal_count: 0,
      severity_breakdown: { high: 0, med: 0, low: 0 },
      drafts_pending: 0,
      brand_pulse: null,
      evidence_refs: ["bootstrap"],
    });
    expect(parsed.brand_pulse).toBeNull();
  });

  it("rejects malformed delivery_date", () => {
    const result = MorningBriefSchema.safeParse({
      delivery_date: "25-04-2026",
      summary_body: "x".repeat(60),
      signal_count: 0,
      severity_breakdown: { high: 0, med: 0, low: 0 },
      drafts_pending: 0,
      brand_pulse: null,
      evidence_refs: ["x"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty evidence_refs", () => {
    const result = MorningBriefSchema.safeParse({
      delivery_date: "2026-04-25",
      summary_body: "x".repeat(60),
      signal_count: 0,
      severity_breakdown: { high: 0, med: 0, low: 0 },
      drafts_pending: 0,
      brand_pulse: null,
      evidence_refs: [],
    });
    expect(result.success).toBe(false);
  });
});
