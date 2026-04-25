import { describe, it, expect } from "vitest";

import { PeecSnapshotFileSchema } from "@/lib/schemas/peec-snapshot";

const baseSnapshot = (): {
  captured_at: string;
  project_id: string;
  brands: Array<{
    id: string;
    name: string;
    domains: string[];
    aliases: string[];
    is_own: boolean;
  }>;
  prompts: Array<{ id: string; text: string; country_code: string }>;
  brand_reports: Array<{
    brand_id: string;
    brand_name: string;
    date: string;
    visibility: number;
    mention_count: number;
    share_of_voice: number;
    sentiment: "positive" | "neutral" | "negative";
    position: number | null;
  }>;
  chats: Array<{
    id: string;
    prompt_id: string;
    model_id: string;
    date: string;
    messages: Array<Record<string, unknown>>;
    brands_mentioned: string[];
    sources: Array<{ url: string; title: string }>;
  }>;
  url_report: Array<{
    url: string;
    title: string | null;
    citation_count: number;
    retrievals: number;
    mentioned_brand_ids: string[];
  }>;
  actions: Array<{
    text: string;
    group_type: "owned" | "editorial" | "reference" | "ugc";
    opportunity_score: number;
  }>;
} => ({
  captured_at: "2026-04-25T07:00:00.000Z",
  project_id: "peec-attio-demo",
  brands: [
    {
      id: "attio",
      name: "Attio",
      domains: ["attio.com"],
      aliases: ["Attio CRM"],
      is_own: true,
    },
  ],
  prompts: [
    { id: "p1", text: "Best CRM for SaaS startups", country_code: "US" },
  ],
  brand_reports: [
    {
      brand_id: "attio",
      brand_name: "Attio",
      date: "2026-04-25",
      visibility: 0.67,
      mention_count: 4,
      share_of_voice: 0.32,
      sentiment: "positive" as const,
      position: 2.1,
    },
  ],
  chats: [
    {
      id: "c1",
      prompt_id: "p1",
      model_id: "gpt-4o",
      date: "2026-04-25T07:00:00.000Z",
      messages: [{ role: "user", content: "x" }],
      brands_mentioned: ["attio", "hubspot"],
      sources: [{ url: "https://attio.com", title: "Attio" }],
    },
  ],
  url_report: [
    {
      url: "https://attio.com/blog/post",
      title: "Attio post",
      citation_count: 3,
      retrievals: 5,
      mentioned_brand_ids: ["attio"],
    },
  ],
  actions: [
    {
      text: "Publish a comparison piece on flexible vs rigid CRM data models.",
      group_type: "owned" as const,
      opportunity_score: 0.82,
    },
  ],
});

describe("PeecSnapshotFileSchema", () => {
  it("parses representative snapshot file", () => {
    const parsed = PeecSnapshotFileSchema.parse(baseSnapshot());
    expect(parsed.brands[0].is_own).toBe(true);
    expect(parsed.brand_reports).toHaveLength(1);
  });

  it("accepts position=null коли brand never ranked", () => {
    const snap = baseSnapshot();
    snap.brand_reports[0].position = null;
    const parsed = PeecSnapshotFileSchema.parse(snap);
    expect(parsed.brand_reports[0].position).toBeNull();
  });

  it("rejects empty brand_reports", () => {
    const snap = baseSnapshot();
    snap.brand_reports = [];
    const result = PeecSnapshotFileSchema.safeParse(snap);
    expect(result.success).toBe(false);
  });

  it("rejects visibility > 1", () => {
    const snap = baseSnapshot();
    snap.brand_reports[0].visibility = 1.2;
    const result = PeecSnapshotFileSchema.safeParse(snap);
    expect(result.success).toBe(false);
  });

  it("rejects malformed date format", () => {
    const snap = baseSnapshot();
    snap.brand_reports[0].date = "25/04/2026";
    const result = PeecSnapshotFileSchema.safeParse(snap);
    expect(result.success).toBe(false);
  });

  it("rejects invalid country_code length", () => {
    const snap = baseSnapshot();
    snap.prompts[0].country_code = "USA";
    const result = PeecSnapshotFileSchema.safeParse(snap);
    expect(result.success).toBe(false);
  });
});
