import { describe, it, expect } from "vitest";

import {
  ContentExpansionOutputSchema,
  ContentVariantSchema,
} from "@/lib/schemas/content-variant";

const PARENT_ID = "11111111-1111-4111-8111-111111111111";

function blogVariant() {
  return {
    channel: "blog" as const,
    title: "Why flexible data models win",
    body: "Attio's flexible data model adapts to your sales process, not the other way around. ".repeat(2),
    metadata: {
      meta_description: "Flexible CRM data models for modern SaaS teams.",
      slug_suggestion: "flexible-data-models",
    },
    evidence_refs: ["draft-id"],
  };
}

function xThreadVariant() {
  return {
    channel: "x_thread" as const,
    title: null,
    body: "Most CRMs force you into their data model. Attio adapts to yours. Here's how that changes onboarding.",
    metadata: {
      tweets: [
        "Most CRMs force you into their data model.",
        "Attio adapts to yours.",
      ],
    },
    evidence_refs: ["draft-id"],
  };
}

function linkedinVariant() {
  return {
    channel: "linkedin" as const,
    title: null,
    body: "We rebuilt our pipeline in Attio in two days. The flexibility paid off immediately for our SDR team.",
    metadata: {
      hashtags: ["CRM", "SaaS"],
    },
    evidence_refs: ["draft-id"],
  };
}

describe("ContentVariantSchema", () => {
  it("parses valid blog variant з proper metadata", () => {
    const parsed = ContentVariantSchema.parse(blogVariant());
    expect(parsed.channel).toBe("blog");
    expect(parsed.title).toBe("Why flexible data models win");
  });

  it("parses valid x_thread variant", () => {
    const parsed = ContentVariantSchema.parse(xThreadVariant());
    expect(parsed.channel).toBe("x_thread");
    expect(parsed.title).toBeNull();
  });

  it("rejects x_thread variant з tweet > 280 chars", () => {
    const bad = xThreadVariant();
    bad.metadata = { tweets: ["x".repeat(281)] };
    const result = ContentVariantSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects non-blog variant з non-null title", () => {
    const bad = xThreadVariant();
    bad.title = "Not allowed for x_thread" as unknown as null;
    const result = ContentVariantSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects blog variant missing meta_description", () => {
    const bad = blogVariant();
    bad.metadata = { slug_suggestion: "x" } as unknown as typeof bad.metadata;
    const result = ContentVariantSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("ContentExpansionOutputSchema", () => {
  it("parses output з all 3 channels", () => {
    const parsed = ContentExpansionOutputSchema.parse({
      parent_counter_draft_id: PARENT_ID,
      variants: [blogVariant(), xThreadVariant(), linkedinVariant()],
    });
    expect(parsed.variants).toHaveLength(3);
  });

  it("rejects output з only 2 variants", () => {
    const result = ContentExpansionOutputSchema.safeParse({
      parent_counter_draft_id: PARENT_ID,
      variants: [blogVariant(), xThreadVariant()],
    });
    expect(result.success).toBe(false);
  });

  it("rejects output з duplicate channel", () => {
    const result = ContentExpansionOutputSchema.safeParse({
      parent_counter_draft_id: PARENT_ID,
      variants: [blogVariant(), blogVariant(), linkedinVariant()],
    });
    expect(result.success).toBe(false);
  });
});
