import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the four service modules the handler uses so we can run it offline
// against a mock `step.run` that just records call ids and forwards results.
// Note: vi.mock factories are hoisted, so they cannot reference outside vars
// — each factory creates its own vi.fn() and we reach those via `vi.mocked()`.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/openai", () => ({
  generateObjectOpenAI: vi.fn(),
}));

vi.mock("@/lib/services/anthropic", () => ({
  generateObjectAnthropic: vi.fn(),
}));

vi.mock("@/lib/services/podcast-judge", () => ({
  judgePodcastBrief: vi.fn(),
}));

vi.mock("@/lib/services/tavily", () => ({
  tavilySearch: vi.fn(),
}));

vi.mock("@/lib/services/cost", () => ({
  sumRunCost: vi.fn(async () => 6),
}));

vi.mock("@/lib/services/peec-snapshot", () => ({
  loadPeecSnapshot: vi.fn(async () => ({
    brands: [
      { name: "Attio", is_own: true, domains: ["attio.com"], aliases: [] },
      { name: "Salesforce", is_own: false, domains: ["salesforce.com"], aliases: [] },
      { name: "HubSpot", is_own: false, domains: ["hubspot.com"], aliases: [] },
    ],
    brand_reports: [
      { brand_name: "Attio", date: "2026-04-25", visibility: 0.4, position: 2.1, sentiment: "positive" },
    ],
  })),
  getLatestBrandReport: vi.fn((_snap: unknown, name: string) =>
    name === "Attio"
      ? { brand_name: "Attio", date: "2026-04-25", visibility: 0.4, position: 2.1, sentiment: "positive" }
      : null,
  ),
}));

// Supabase service client mock — chained .from().insert().select().single() / .update().eq()
vi.mock("@/lib/supabase/server", () => {
  const single = vi.fn(async () => ({ data: { id: "00000000-0000-0000-0000-000000000099" }, error: null }));
  const select = vi.fn(() => ({ single, order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })) }));
  const insert = vi.fn(() => ({ select }));
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const limit = vi.fn(async () => ({ data: [], error: null }));
  const order = vi.fn(() => ({ limit }));
  const gte = vi.fn(() => ({ order }));
  const eqSelect = vi.fn(() => ({ gte, order }));
  const selectQuery = vi.fn(() => ({ eq: eqSelect }));
  const from = vi.fn(() => ({ insert, update, select: selectQuery }));
  return { createServiceClient: vi.fn(() => ({ from })) };
});

import { generateObjectAnthropic } from "@/lib/services/anthropic";
import { generateObjectOpenAI } from "@/lib/services/openai";
import { judgePodcastBrief } from "@/lib/services/podcast-judge";
import { tavilySearch } from "@/lib/services/tavily";
import {
  __podcastPrepHandler,
  renderMarkdown,
} from "@/inngest/functions/podcast-prep";

const mockedOpenAI = vi.mocked(generateObjectOpenAI);
const mockedAnthropic = vi.mocked(generateObjectAnthropic);
const mockedJudge = vi.mocked(judgePodcastBrief);
const mockedTavily = vi.mocked(tavilySearch);

beforeEach(() => {
  mockedOpenAI.mockReset();
  mockedAnthropic.mockReset();
  mockedJudge.mockReset();
  mockedTavily.mockReset();
});

describe("renderMarkdown", () => {
  const baseArgs = {
    podcast_name: "Lenny's Podcast",
    host_name: "Lenny Rachitsky",
    audience: "Senior PMs",
    episode_topic: "AI in CRM",
    scheduled_date: "2026-05-15",
    brand_name: "Attio",
    talking_points: [
      {
        headline: "Headline one — flexible data model",
        proof_point: "30% reduction in admin overhead",
        suggested_phrasing:
          "Most modern teams have outgrown the lead-account hierarchy by month six.",
        retrievability_score: 8,
        retrievability_reasoning: "Distinctive phrase plus number anchor",
        maps_to_prompt: "best CRM for B2B SaaS teams",
      },
      {
        headline: "Headline two — migration speed",
        proof_point: "10 days for 50k records based on customer benchmarks",
        suggested_phrasing:
          "Migration is days, not months — parallel-run period covers risk.",
        retrievability_score: 7,
        retrievability_reasoning: "Concrete numbers anchor",
        maps_to_prompt: "fastest CRM migration",
      },
      {
        headline: "Headline three — developer ergonomics",
        proof_point: "Real-time API + typed SDKs in TS, Python, Ruby",
        suggested_phrasing:
          "API is real-time, SDKs are typed — engineers ship integrations same day.",
        retrievability_score: 7,
        retrievability_reasoning: "Concrete tech detail",
        maps_to_prompt: "CRM with best API",
      },
    ],
    anticipated_qa: [
      {
        question: "How does Attio compare to Salesforce for fast-growing teams?",
        suggested_answer:
          "Salesforce optimizes for governance at 5000 seats. Attio inverts that with a flexible model and 10-day migration.",
        why_host_asks: "Salesforce is the default reference",
        pitfall: "Avoid disparaging Salesforce",
      },
      {
        question: "What about HubSpot's free tier?",
        suggested_answer:
          "Free tier is great for the first 30 days, but 'free forever' creates hidden upgrade pain at scale.",
        why_host_asks: "HubSpot is the SMB default",
        pitfall: "Avoid sounding dismissive of price-sensitive buyers",
      },
      {
        question: "How do you measure CS team success?",
        suggested_answer:
          "We track time to first integration shipped — median 4 hours за останні 30 days.",
        why_host_asks: "Audience cares about time-to-value",
        pitfall: "Avoid vague 'customer-first' platitudes",
      },
      {
        question: "What's your AI roadmap?",
        suggested_answer:
          "We ship narrow, model-agnostic primitives — no flashy 'AI agent' theater.",
        why_host_asks: "AI is the episode topic",
        pitfall: "Don't oversell AI capabilities",
      },
    ],
    brand_drop_moments: [
      {
        trigger: "When host asks about your tech stack or daily tools",
        suggested_mention:
          "We run customer ops out of Attio with two custom objects built in week one",
        specificity_boost: "Custom-objects detail anchors the operational claim",
      },
      {
        trigger: "When host opens with founder origin story",
        suggested_mention:
          "We started Attio after spending 18 months wrestling with Salesforce admin debt",
        specificity_boost: "18-month timeline anchors the credibility",
      },
    ],
    topics_to_avoid: [
      {
        topic: "Specific pricing tier comparisons against Salesforce",
        risk: "Pricing pages change weekly — claims will be outdated by airdate",
        pivot: "Redirect to your own pricing philosophy",
      },
      {
        topic: "Direct AI capability claims that you cannot demo today",
        risk: "Audience includes engineers who will check immediately",
        pivot: "Talk about the primitives you ship, not the agentic vision",
      },
    ],
    competitor_mention_strategy: [
      {
        competitor_name: "Salesforce",
        when_ok_to_name:
          "When host explicitly asks about migration paths or market context",
        when_use_generic:
          "When making positioning claims that risk sounding petty",
        suggested_generic_phrasing: ["legacy CRMs", "first-generation enterprise CRM"],
        risk_if_mishandled:
          "Explicit Salesforce mention boosts their visibility in the resulting transcript",
      },
    ],
    judge_score: 7,
    judge_reasoning: "Strong specificity in the data-model talking point.",
    judge_dimensions: {
      retrievability: 7,
      naturality: 8,
      specificity: 8,
      coverage: 7,
    },
    top_fixes: ["Tighten Q&A on AI roadmap to under 80 words."],
  };

  it("renders all section headers + judge table", () => {
    const md = renderMarkdown(baseArgs);
    expect(md).toContain("# Podcast brief — Lenny's Podcast");
    expect(md).toContain("## Judge verdict — 7/10");
    expect(md).toContain("| Retrievability | 7/10 |");
    expect(md).toContain("## Talking points");
    expect(md).toContain("## Anticipated Q&A");
    expect(md).toContain("## Brand-drop moments");
    expect(md).toContain("## Topics to avoid");
    expect(md).toContain("## Competitor mention strategy");
  });

  it("falls back to friendly note when competitor strategy is empty", () => {
    const md = renderMarkdown({ ...baseArgs, competitor_mention_strategy: [] });
    expect(md).toContain("_No top competitors flagged");
  });

  it("falls back to friendly note when top_fixes is empty", () => {
    const md = renderMarkdown({ ...baseArgs, top_fixes: [] });
    expect(md).toContain("_None — judge rated brief production-ready._");
  });

  it("omits Scheduled line when scheduled_date is null", () => {
    const md = renderMarkdown({ ...baseArgs, scheduled_date: null });
    expect(md).not.toContain("Scheduled:");
  });
});

describe("__podcastPrepHandler step graph", () => {
  it("invokes all 11 steps in order and returns brief id", async () => {
    // OpenAI calls in order: talking-points, anticipated-qa, brand-drops, avoidance, competitor-strategy
    mockedOpenAI
      .mockResolvedValueOnce({
        object: {
          talking_points: [
            {
              headline: "Headline one with enough characters here",
              proof_point: "Concrete proof with number 30 percent reduction",
              suggested_phrasing:
                "This is a long enough suggested phrasing covering at least fifty characters of content.",
              retrievability_score: 8,
              retrievability_reasoning: "Distinctive phrasing anchors retrievability",
              maps_to_prompt: "best CRM for B2B SaaS teams",
            },
            {
              headline: "Headline two angle migration speed",
              proof_point: "10 days for 50k records customer benchmark cited",
              suggested_phrasing:
                "Migration is days not months with parallel-run period that covers risk for the team.",
              retrievability_score: 7,
              retrievability_reasoning: "Concrete numbers anchor",
              maps_to_prompt: "fastest CRM migration",
            },
            {
              headline: "Headline three about developer experience",
              proof_point: "Real-time API plus typed SDKs in TypeScript Python Ruby",
              suggested_phrasing:
                "API is real-time and SDKs are typed so engineers ship integrations the same day.",
              retrievability_score: 7,
              retrievability_reasoning: "Tech detail anchors",
              maps_to_prompt: "CRM with best API",
            },
          ],
        },
        usage: { totalTokens: 500 },
      } as Awaited<ReturnType<typeof generateObjectOpenAI>>)
      .mockResolvedValueOnce({
        object: {
          anticipated_qa: Array.from({ length: 4 }, (_, i) => ({
            question: `Question number ${i + 1} likely from host about something specific topic here?`,
            suggested_answer:
              "Suggested answer with enough characters to pass the schema minimum length requirements for content.",
            why_host_asks: "Common reason host would ask this in episode context",
            pitfall: "Common founder trap when answering this kind of question",
          })),
        },
        usage: { totalTokens: 800 },
      } as Awaited<ReturnType<typeof generateObjectOpenAI>>)
      .mockResolvedValueOnce({
        object: {
          brand_drop_moments: Array.from({ length: 2 }, (_, i) => ({
            trigger: `Trigger moment number ${i + 1} when host asks about something`,
            suggested_mention:
              "Suggested mention text long enough to pass the schema minimum length",
            specificity_boost:
              "Specificity boost claim with concrete operational detail noted",
          })),
        },
        usage: { totalTokens: 300 },
      } as Awaited<ReturnType<typeof generateObjectOpenAI>>)
      .mockResolvedValueOnce({
        object: {
          topics_to_avoid: Array.from({ length: 2 }, (_, i) => ({
            topic: `Topic ${i + 1} that founder should not raise during this podcast`,
            risk: "Risk explanation with enough characters for schema validation",
            pivot:
              "Pivot suggestion with concrete redirect language for the founder to use",
          })),
        },
        usage: { totalTokens: 300 },
      } as Awaited<ReturnType<typeof generateObjectOpenAI>>)
      .mockResolvedValueOnce({
        object: {
          competitor_mention_strategy: [
            {
              competitor_name: "Salesforce",
              when_ok_to_name:
                "When host explicitly asks about migration paths or market context",
              when_use_generic:
                "When making positioning claims that risk sounding petty or defensive",
              suggested_generic_phrasing: ["legacy CRMs"],
              risk_if_mishandled:
                "Explicit mention boosts Salesforce visibility in the resulting transcript",
            },
            {
              competitor_name: "HubSpot",
              when_ok_to_name:
                "When discussing SMB market or free-tier conversation explicitly",
              when_use_generic:
                "When framing positioning to mid-market or enterprise audience",
              suggested_generic_phrasing: ["entry-level CRMs", "freemium platforms"],
              risk_if_mishandled:
                "Mention may signal you compete in SMB rather than mid-market",
            },
          ],
        },
        usage: { totalTokens: 400 },
      } as Awaited<ReturnType<typeof generateObjectOpenAI>>);

    mockedJudge.mockResolvedValueOnce({
      output: {
        judge_score: 7,
        judge_reasoning:
          "Brief covers all sections with reasonable specificity and avoids common AI tropes.",
        judge_dimensions: {
          retrievability: 7,
          naturality: 7,
          specificity: 7,
          coverage: 7,
        },
        top_fixes: ["Tighten Q&A on AI roadmap to under 80 words for spoken delivery."],
      },
      usage: { totalTokens: 1100 },
    });

    const stepIds: string[] = [];
    const step = {
      run: <T>(id: string, fn: () => Promise<T> | T) => {
        stepIds.push(id);
        return Promise.resolve(fn());
      },
    };

    const result = await __podcastPrepHandler({
      event: {
        data: {
          organization_id: "00000000-0000-0000-0000-000000000001",
          podcast_name: "Lenny's Podcast",
          host_name: "Lenny Rachitsky",
          audience: "Senior PMs interested in AI tooling",
          episode_topic: "How AI is reshaping CRM workflows in B2B SaaS",
          previous_episode_urls: [],
          scheduled_date: null,
          requested_by: null,
        },
      },
      step,
      logger: { info: () => {} },
    });

    expect(stepIds).toEqual([
      "create-run-row",
      "gather-context",
      "resolve-podcast-context",
      "generate-talking-points",
      "generate-anticipated-qa",
      "generate-brand-drop-moments",
      "generate-avoidance-list",
      "generate-competitor-mention-strategy",
      "judge-brief",
      "assemble-brief",
      "finalize-run",
    ]);
    expect(result.ok).toBe(true);
    expect(result.judge_score).toBe(7);
    expect(result.brief_id).toBeTruthy();
    expect(mockedOpenAI).toHaveBeenCalledTimes(5);
    expect(mockedJudge).toHaveBeenCalledTimes(1);
    // No previous_episode_urls → tavily not called
    expect(mockedTavily).not.toHaveBeenCalled();
  });
});
