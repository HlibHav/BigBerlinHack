import { describe, it, expect } from "vitest";

import { CounterDraftSchema } from "@/lib/schemas/counter-draft";

describe("CounterDraftSchema", () => {
  it("parses valid counter-draft з UUID + URL у evidence_refs", () => {
    const parsed = CounterDraftSchema.parse({
      body: "Attio focuses on flexible data models and modern UX — different problem than HubSpot's automation suite.",
      channel_hint: "linkedin",
      tone_pillar: "calm-confident",
      reasoning: "Brand voice favors confident comparison without disparagement.",
      evidence_refs: [
        "5b8c9c0e-1234-4abc-9def-1234567890ab",
        "https://attio.com/blog/data-model",
      ],
    });
    expect(parsed.channel_hint).toBe("linkedin");
    expect(parsed.evidence_refs).toHaveLength(2);
  });

  it("rejects body shorter than 50 chars", () => {
    const result = CounterDraftSchema.safeParse({
      body: "Too short",
      channel_hint: "x",
      tone_pillar: "calm-confident",
      reasoning: "Long enough reasoning here.",
      evidence_refs: ["abc"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty evidence_refs", () => {
    const result = CounterDraftSchema.safeParse({
      body: "x".repeat(60),
      channel_hint: "blog",
      tone_pillar: "tone",
      reasoning: "Reasoning text long enough to pass min length check.",
      evidence_refs: [],
    });
    expect(result.success).toBe(false);
  });
});
