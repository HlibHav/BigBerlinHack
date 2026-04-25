import { describe, it, expect } from "vitest";

import {
  NarrativeVariantSchema,
  SimulatorOutputSchema,
} from "@/lib/schemas/narrative-variant";

describe("NarrativeVariantSchema", () => {
  it("parses valid variant з all fields", () => {
    const parsed = NarrativeVariantSchema.parse({
      rank: 1,
      body: "Attio's flexible data model serves SaaS teams who outgrow rigid CRMs early.".repeat(2),
      score: 0.53,
      score_reasoning: "High mention rate (0.8) with avg position 1.5 yields strong score.",
      predicted_sentiment: "positive",
      avg_position: 1.5,
      mention_rate: 0.8,
      evidence_refs: ["sim-prompt-1", "sim-prompt-2"],
    });
    expect(parsed.rank).toBe(1);
    expect(parsed.avg_position).toBe(1.5);
  });

  it("accepts avg_position null коли brand never mentioned", () => {
    const parsed = NarrativeVariantSchema.parse({
      rank: 5,
      body: "Variant body that is long enough to pass the minimum 50 chars check on body length.",
      score: 0,
      score_reasoning: "Brand was never mentioned in any test prompt — score floored to zero.",
      predicted_sentiment: "neutral",
      avg_position: null,
      mention_rate: 0,
      evidence_refs: ["sim-prompt-1"],
    });
    expect(parsed.avg_position).toBeNull();
  });

  it("rejects rank out of range", () => {
    const result = NarrativeVariantSchema.safeParse({
      rank: 6,
      body: "x".repeat(60),
      score: 0.5,
      score_reasoning: "reasoning long enough text here",
      predicted_sentiment: "positive",
      avg_position: 2,
      mention_rate: 0.5,
      evidence_refs: ["x"],
    });
    expect(result.success).toBe(false);
  });
});

describe("SimulatorOutputSchema", () => {
  it("parses output з 3 variants + seed_echo", () => {
    const parsed = SimulatorOutputSchema.parse({
      seed_echo: "compare-attio-vs-hubspot",
      variants: [1, 2, 3].map((rank) => ({
        rank,
        body: `Variant body ${rank} long enough to pass the minimum check on body length.`,
        score: 0.4,
        score_reasoning: "Reasoning text long enough to satisfy min length validator.",
        predicted_sentiment: "positive" as const,
        avg_position: 2,
        mention_rate: 0.6,
        evidence_refs: ["x"],
      })),
    });
    expect(parsed.variants).toHaveLength(3);
  });

  it("rejects empty variants array", () => {
    const result = SimulatorOutputSchema.safeParse({
      seed_echo: "x",
      variants: [],
    });
    expect(result.success).toBe(false);
  });
});
