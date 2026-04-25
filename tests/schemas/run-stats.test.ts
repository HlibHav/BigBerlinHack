import { describe, it, expect } from "vitest";

import {
  ContentExpandRunStatsSchema,
  MorningBriefRunStatsSchema,
  RadarRunStatsSchema,
  RunStatsSchema,
  SimulatorRunStatsSchema,
} from "@/lib/schemas/run-stats";

describe("RunStatsSchema discriminated union", () => {
  it("parses competitor-radar variant", () => {
    const parsed = RunStatsSchema.parse({
      function_name: "competitor-radar",
      started_at: "2026-04-25T08:00:00.000Z",
      duration_seconds: 42,
      sources_scanned: 12,
      signals_total: 7,
      signals_by_severity: { high: 1, med: 3, low: 3 },
      drafts_generated: 1,
      cost_usd_cents: 35,
    });
    expect(parsed.function_name).toBe("competitor-radar");
  });

  it("parses narrative-simulator variant", () => {
    const parsed = SimulatorRunStatsSchema.parse({
      function_name: "narrative-simulator",
      started_at: "2026-04-25T08:00:00.000Z",
      duration_seconds: 18,
      variants_generated: 3,
      prompts_per_variant: 5,
      models_used: ["gpt-4o", "claude-opus-4-7"],
      cost_usd_cents: 50,
    });
    expect(parsed.variants_generated).toBe(3);
  });

  it("parses content-expand variant", () => {
    const parsed = ContentExpandRunStatsSchema.parse({
      function_name: "content-expand",
      started_at: "2026-04-25T08:00:00.000Z",
      duration_seconds: 12,
      parent_counter_draft_id: "11111111-1111-4111-8111-111111111111",
      variants_generated: 4,
      cost_usd_cents: 22,
    });
    expect(parsed.variants_generated).toBe(4);
  });

  it("parses morning-brief variant", () => {
    const parsed = MorningBriefRunStatsSchema.parse({
      function_name: "morning-brief",
      started_at: "2026-04-25T08:00:00.000Z",
      duration_seconds: 4,
      delivery_channel: "slack",
      delivered: true,
      signals_summarized: 5,
      cost_usd_cents: 8,
    });
    expect(parsed.delivery_channel).toBe("slack");
  });

  it("rejects unknown function_name", () => {
    const result = RunStatsSchema.safeParse({
      function_name: "bogus",
      started_at: "2026-04-25T08:00:00.000Z",
      duration_seconds: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative duration_seconds на radar variant", () => {
    const result = RadarRunStatsSchema.safeParse({
      function_name: "competitor-radar",
      started_at: "2026-04-25T08:00:00.000Z",
      duration_seconds: -1,
      sources_scanned: 0,
      signals_total: 0,
      signals_by_severity: { high: 0, med: 0, low: 0 },
      drafts_generated: 0,
      cost_usd_cents: 0,
    });
    expect(result.success).toBe(false);
  });
});
