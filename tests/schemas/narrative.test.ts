import { describe, it, expect } from "vitest";

import { NarrativeSchema } from "@/lib/schemas/narrative";

describe("NarrativeSchema [DEFERRED — W4 widget cut]", () => {
  it("parses valid narrative payload", () => {
    const parsed = NarrativeSchema.parse({
      summary_markdown: "## Attio narrative\n\n" + "Attio is positioned as a flexible CRM. ".repeat(10),
      highlighted_themes: ["Flexible data model", "Modern UX", "Developer-friendly"],
      citation_ids: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
    });
    expect(parsed.highlighted_themes).toHaveLength(3);
    expect(parsed.citation_ids).toHaveLength(2);
  });

  it("rejects empty citation_ids", () => {
    const result = NarrativeSchema.safeParse({
      summary_markdown: "x".repeat(150),
      highlighted_themes: ["theme"],
      citation_ids: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects summary_markdown shorter than 100 chars", () => {
    const result = NarrativeSchema.safeParse({
      summary_markdown: "too short",
      highlighted_themes: ["theme"],
      citation_ids: ["11111111-1111-4111-8111-111111111111"],
    });
    expect(result.success).toBe(false);
  });
});
