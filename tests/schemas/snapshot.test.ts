import { describe, it, expect } from "vitest";

import { SnapshotSchema } from "@/lib/schemas/snapshot";

describe("SnapshotSchema", () => {
  it("parses valid snapshot з citations", () => {
    const parsed = SnapshotSchema.parse({
      prompt: "Compare CRM tools for early-stage SaaS",
      model: "gpt-4o",
      response_text: "Attio, HubSpot, and Salesforce all serve different segments.",
      citations: [
        {
          url: "https://attio.com/pricing",
          title: "Attio pricing",
          excerpt: "Attio pricing starts at $34/month per user.",
        },
      ],
    });
    expect(parsed.citations).toHaveLength(1);
    expect(parsed.citations[0].url).toBe("https://attio.com/pricing");
  });

  it("rejects empty citations array", () => {
    const result = SnapshotSchema.safeParse({
      prompt: "test",
      model: "gpt-4o",
      response_text: "answer",
      citations: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects excerpt longer than 500 chars", () => {
    const result = SnapshotSchema.safeParse({
      prompt: "test",
      model: "gpt-4o",
      response_text: "answer",
      citations: [
        {
          url: "https://example.com",
          title: "x",
          excerpt: "x".repeat(501),
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
