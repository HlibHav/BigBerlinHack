import { describe, it, expect, vi } from "vitest";

// Stub server-only since vitest runs these tests in node directly.
vi.mock("server-only", () => ({}));

import {
  extractChatExchange,
  getCitationGaps,
  getOwnBrand,
  getTopRetrievalUrls,
} from "@/lib/services/peec-snapshot";
import type {
  PeecBrand,
  PeecChat,
  PeecSnapshotFile,
  PeecUrlReportRow,
} from "@/lib/schemas/peec-snapshot";

function brand(id: string, name: string, is_own = false): PeecBrand {
  return { id, name, domains: [`${name.toLowerCase()}.com`], aliases: [], is_own };
}

function urlRow(
  url: string,
  retrievals: number,
  mentioned_brand_ids: string[],
): PeecUrlReportRow {
  return {
    url,
    title: null,
    citation_count: 0,
    retrievals,
    mentioned_brand_ids,
  };
}

const ownBrand = brand("kw_own", "Attio", true);
const competitor1 = brand("kw_sf", "Salesforce");
const competitor2 = brand("kw_hs", "HubSpot");

const baseSnapshot: PeecSnapshotFile = {
  captured_at: "2026-04-25T00:00:00.000Z",
  project_id: "proj_test",
  brands: [ownBrand, competitor1, competitor2],
  prompts: [],
  brand_reports: [
    {
      brand_id: ownBrand.id,
      brand_name: ownBrand.name,
      date: "2026-04-25",
      visibility: 0.4,
      mention_count: 1,
      share_of_voice: 0.3,
      sentiment: "positive",
      position: 2,
    },
  ],
  chats: [],
  url_report: [],
  actions: [],
};

describe("getOwnBrand", () => {
  it("returns brand with is_own=true", () => {
    expect(getOwnBrand(baseSnapshot)).toEqual(ownBrand);
  });
  it("returns null when no own brand exists", () => {
    expect(
      getOwnBrand({ ...baseSnapshot, brands: [competitor1, competitor2] }),
    ).toBeNull();
  });
});

describe("getCitationGaps", () => {
  it("excludes URLs that already cite the own brand", () => {
    const snap: PeecSnapshotFile = {
      ...baseSnapshot,
      url_report: [
        urlRow("https://a.com/", 10, [ownBrand.id, competitor1.id]),
        urlRow("https://b.com/", 5, [competitor1.id, competitor2.id]),
      ],
    };
    const gaps = getCitationGaps(snap);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.url).toBe("https://b.com/");
    expect(gaps[0]?.competitor_brand_names).toEqual(
      expect.arrayContaining(["Salesforce", "HubSpot"]),
    );
  });

  it("sorts gaps by retrievals descending", () => {
    const snap: PeecSnapshotFile = {
      ...baseSnapshot,
      url_report: [
        urlRow("https://low.com/", 2, [competitor1.id]),
        urlRow("https://high.com/", 50, [competitor2.id]),
        urlRow("https://mid.com/", 12, [competitor1.id]),
      ],
    };
    const gaps = getCitationGaps(snap);
    expect(gaps.map((g) => g.url)).toEqual([
      "https://high.com/",
      "https://mid.com/",
      "https://low.com/",
    ]);
  });

  it("respects limit option", () => {
    const snap: PeecSnapshotFile = {
      ...baseSnapshot,
      url_report: [
        urlRow("https://a.com/", 10, [competitor1.id]),
        urlRow("https://b.com/", 5, [competitor2.id]),
        urlRow("https://c.com/", 3, [competitor1.id]),
      ],
    };
    const gaps = getCitationGaps(snap, { limit: 2 });
    expect(gaps).toHaveLength(2);
  });

  it("returns empty array when no own brand is present", () => {
    const snap: PeecSnapshotFile = {
      ...baseSnapshot,
      brands: [competitor1, competitor2],
      url_report: [urlRow("https://a.com/", 10, [competitor1.id])],
    };
    expect(getCitationGaps(snap)).toEqual([]);
  });

  it("skips URLs whose only mentioned brand is unknown", () => {
    const snap: PeecSnapshotFile = {
      ...baseSnapshot,
      url_report: [urlRow("https://ghost.com/", 99, ["kw_unknown"])],
    };
    expect(getCitationGaps(snap)).toEqual([]);
  });
});

describe("getTopRetrievalUrls", () => {
  it("returns rows sorted by retrievals desc and respects limit", () => {
    const snap: PeecSnapshotFile = {
      ...baseSnapshot,
      url_report: [
        urlRow("https://a.com/", 1, [competitor1.id]),
        urlRow("https://b.com/", 10, [competitor1.id]),
        urlRow("https://c.com/", 5, [competitor2.id]),
      ],
    };
    const top = getTopRetrievalUrls(snap, 2);
    expect(top.map((r) => r.url)).toEqual(["https://b.com/", "https://c.com/"]);
  });
});

describe("extractChatExchange", () => {
  it("extracts user + assistant messages", () => {
    const chat: PeecChat = {
      id: "ch_1",
      prompt_id: "pr_1",
      model_id: "openai-scraper",
      date: "2026-04-25T08:00:00.000Z",
      messages: [
        { role: "user", content: "Best CRM?" },
        { role: "assistant", content: "Attio for speed." },
      ],
      brands_mentioned: ["Attio"],
      sources: [],
    };
    expect(extractChatExchange(chat)).toEqual({
      user: "Best CRM?",
      assistant: "Attio for speed.",
    });
  });

  it("returns empty strings when messages are malformed", () => {
    const chat: PeecChat = {
      id: "ch_2",
      prompt_id: "pr_2",
      model_id: "openai-scraper",
      date: "2026-04-25T08:00:00.000Z",
      messages: [{ unexpected: "shape" }],
      brands_mentioned: [],
      sources: [],
    };
    expect(extractChatExchange(chat)).toEqual({ user: "", assistant: "" });
  });
});
