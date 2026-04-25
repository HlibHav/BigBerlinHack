import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Stub server-only since vitest runs these tests in node directly
vi.mock("server-only", () => ({}));

// Mock cost recorder so we don't try to write to Supabase from tests
vi.mock("@/lib/services/cost", () => ({
  recordCost: vi.fn().mockResolvedValue(undefined),
}));

import { tavilySearch } from "@/lib/services/tavily";

describe("tavilySearch", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ query: "x", results: [] }),
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("sends only the base parameters when no optional params provided", async () => {
    await tavilySearch({ query: "Attio CRM", organization_id: orgId });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      api_key: "tvly-test-key",
      query: "Attio CRM",
      max_results: 5,
      search_depth: "basic",
    });
    expect(body.include_domains).toBeUndefined();
    expect(body.exclude_domains).toBeUndefined();
    expect(body.topic).toBeUndefined();
    expect(body.days).toBeUndefined();
  });

  it("forwards include_domains for socials-specific search", async () => {
    await tavilySearch({
      query: "Salesforce launch",
      include_domains: ["twitter.com", "x.com"],
      organization_id: orgId,
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.include_domains).toEqual(["twitter.com", "x.com"]);
  });

  it("forwards exclude_domains and topic + days for news search", async () => {
    await tavilySearch({
      query: "AI-native CRM",
      exclude_domains: ["attio.com"],
      topic: "news",
      days: 7,
      organization_id: orgId,
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.exclude_domains).toEqual(["attio.com"]);
    expect(body.topic).toBe("news");
    expect(body.days).toBe(7);
  });

  it("ignores days when topic is general", async () => {
    await tavilySearch({
      query: "CRM",
      topic: "general",
      days: 30,
      organization_id: orgId,
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.topic).toBe("general");
    expect(body.days).toBeUndefined();
  });

  it("clamps days to [1, 365]", async () => {
    await tavilySearch({
      query: "CRM",
      topic: "news",
      days: 9999,
      organization_id: orgId,
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.days).toBe(365);
  });

  it("supports search_depth override", async () => {
    await tavilySearch({
      query: "CRM",
      search_depth: "advanced",
      organization_id: orgId,
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.search_depth).toBe("advanced");
  });

  it("throws if TAVILY_API_KEY is missing", async () => {
    delete process.env.TAVILY_API_KEY;
    await expect(
      tavilySearch({ query: "x", organization_id: orgId }),
    ).rejects.toThrow(/TAVILY_API_KEY/);
  });
});
