import { describe, it, expect } from "vitest";

import { SignalSchema } from "@/lib/schemas/signal";

describe("SignalSchema", () => {
  it("parses valid Peec-sourced signal", () => {
    const parsed = SignalSchema.parse({
      source_type: "peec_delta",
      source_url: "https://app.peec.ai/projects/p1/brands/attio",
      severity: "high",
      sentiment: "negative",
      summary:
        "Attio visibility dropped 12 percentage points day-over-day across CRM comparison prompts.",
      reasoning:
        "Three of seven monitored prompts no longer surface Attio in top 5 — likely competitor SEO push.",
      evidence_refs: [
        "https://app.peec.ai/projects/p1/brands/attio",
        "https://example.com/peec-snapshot-2026-04-25.json",
      ],
    });
    expect(parsed.source_type).toBe("peec_delta");
    expect(parsed.severity).toBe("high");
  });

  it("parses Tavily competitor signal", () => {
    const parsed = SignalSchema.parse({
      source_type: "competitor",
      source_url: "https://hubspot.com/blog/new-feature",
      severity: "med",
      sentiment: "neutral",
      summary: "HubSpot launched new pipeline-automation feature targeting SMB market segment.",
      reasoning: "Direct competitive move on Attio's core ICP — flagged as medium impact.",
      evidence_refs: ["https://hubspot.com/blog/new-feature"],
    });
    expect(parsed.severity).toBe("med");
  });

  it("rejects empty evidence_refs", () => {
    const result = SignalSchema.safeParse({
      source_type: "competitor",
      source_url: "https://example.com",
      severity: "low",
      sentiment: "neutral",
      summary: "Some signal that has enough characters to pass min check.",
      reasoning: "Long enough reasoning text here.",
      evidence_refs: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid source_type", () => {
    const result = SignalSchema.safeParse({
      source_type: "bogus",
      source_url: "https://example.com",
      severity: "low",
      sentiment: "neutral",
      summary: "Some signal that has enough characters to pass min check.",
      reasoning: "Long enough reasoning text here.",
      evidence_refs: ["https://example.com"],
    });
    expect(result.success).toBe(false);
  });
});
