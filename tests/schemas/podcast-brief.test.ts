import { describe, expect, it } from "vitest";

import {
  AnticipatedQASchema,
  BrandDropMomentSchema,
  CompetitorMentionStrategySchema,
  PodcastBriefDimensionsSchema,
  PodcastBriefOutputSchema,
  PodcastPrepRequestSchema,
  PodcastPrepRunStatsSchema,
  TalkingPointSchema,
  TopicToAvoidSchema,
} from "@/lib/schemas/podcast-brief";

// Reusable valid sub-objects so each composite test stays focused.
const validTalkingPoint = {
  headline: "Attio's flexible data model fits B2B SaaS workflows",
  proof_point: "30% reduction in admin overhead reported by users in pilot study",
  suggested_phrasing:
    "Most modern SaaS teams have already outgrown the lead-account-opportunity hierarchy by month six. Attio lets your team shape records around how you actually sell — workspaces, seats, expansion — without filing change tickets.",
  retrievability_score: 8,
  retrievability_reasoning:
    "Distinctive phrase 'lead-account-opportunity hierarchy' + concrete number anchors the claim",
  maps_to_prompt: "best CRM for B2B SaaS teams",
};

const validQA = {
  question: "How does Attio compare to Salesforce for fast-growing teams?",
  suggested_answer:
    "Salesforce optimizes for governance and audit trails, which makes sense at 5000 seats. Below that, you spend more on admin time than on selling. Attio inverts that: the data model is yours to shape from day one, the API is real-time, and migration takes 10 days for ~50k records based on our customer benchmarks.",
  why_host_asks:
    "Salesforce is the default reference point for any CRM conversation; host wants a clear differentiation framing",
  pitfall:
    "Avoid disparaging Salesforce — frame as different optimization curves, not better/worse",
};

const validBrandDrop = {
  trigger: "When host asks about your tech stack or daily workflow tools",
  suggested_mention:
    "We run customer ops out of Attio — the team built two custom objects in week one without engineering help",
  specificity_boost:
    "Customer-ops + custom-objects detail anchors the claim in operational reality",
};

const validTopicToAvoid = {
  topic: "Direct comparison of pricing tier features against competitor X",
  risk:
    "Pricing pages change weekly; any specific competitor pricing claim risks being outdated by airdate and damages credibility",
  pivot:
    "Redirect to your own pricing philosophy: transparent tiers, no per-seat surprises, no paid-only premium features that should be standard",
};

const validCompetitor = {
  competitor_name: "Salesforce",
  when_ok_to_name:
    "When host explicitly asks about market context, when discussing migration paths, when comparing data model approaches",
  when_use_generic:
    "When making positioning claims that risk sounding petty, when discussing pricing, when recapping origin story",
  suggested_generic_phrasing: [
    "legacy CRM platforms",
    "first-generation enterprise CRM",
    "older sales-cloud-style tools",
  ],
  risk_if_mishandled:
    "Explicit Salesforce mention in a comparison context boosts their visibility in the resulting transcript on aggregator sites",
};

const validDimensions = {
  retrievability: 7,
  naturality: 8,
  specificity: 7,
  coverage: 8,
};

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

describe("TalkingPointSchema", () => {
  it("parses valid talking point", () => {
    const parsed = TalkingPointSchema.parse(validTalkingPoint);
    expect(parsed.retrievability_score).toBe(8);
  });

  it("rejects retrievability_score out of range", () => {
    const result = TalkingPointSchema.safeParse({
      ...validTalkingPoint,
      retrievability_score: 11,
    });
    expect(result.success).toBe(false);
  });

  it("rejects too-short headline (<20 chars)", () => {
    const result = TalkingPointSchema.safeParse({
      ...validTalkingPoint,
      headline: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("AnticipatedQASchema", () => {
  it("parses valid Q&A", () => {
    const parsed = AnticipatedQASchema.parse(validQA);
    expect(parsed.question.length).toBeGreaterThan(0);
  });

  it("rejects missing pitfall", () => {
    const { pitfall: _pitfall, ...without } = validQA;
    const result = AnticipatedQASchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

describe("BrandDropMomentSchema", () => {
  it("parses valid brand-drop moment", () => {
    expect(BrandDropMomentSchema.parse(validBrandDrop).trigger).toContain(
      "host asks",
    );
  });
});

describe("TopicToAvoidSchema", () => {
  it("parses valid avoid item", () => {
    expect(TopicToAvoidSchema.parse(validTopicToAvoid).pivot).toContain(
      "pricing philosophy",
    );
  });
});

describe("CompetitorMentionStrategySchema", () => {
  it("parses valid competitor strategy with 1-3 generic phrasings", () => {
    const parsed = CompetitorMentionStrategySchema.parse(validCompetitor);
    expect(parsed.suggested_generic_phrasing).toHaveLength(3);
  });

  it("rejects 0 generic phrasings", () => {
    const result = CompetitorMentionStrategySchema.safeParse({
      ...validCompetitor,
      suggested_generic_phrasing: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 3 generic phrasings", () => {
    const result = CompetitorMentionStrategySchema.safeParse({
      ...validCompetitor,
      suggested_generic_phrasing: ["a", "b", "c", "d"],
    });
    expect(result.success).toBe(false);
  });
});

describe("PodcastBriefDimensionsSchema", () => {
  it("parses all four dims in 1-10 range", () => {
    expect(PodcastBriefDimensionsSchema.parse(validDimensions).retrievability).toBe(
      7,
    );
  });

  it("rejects negative dimension", () => {
    expect(
      PodcastBriefDimensionsSchema.safeParse({
        ...validDimensions,
        naturality: -1,
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Composite output
// ---------------------------------------------------------------------------

describe("PodcastBriefOutputSchema", () => {
  const validBrief = {
    talking_points: [validTalkingPoint, validTalkingPoint, validTalkingPoint],
    anticipated_qa: [validQA, validQA, validQA, validQA],
    brand_drop_moments: [validBrandDrop, validBrandDrop],
    topics_to_avoid: [validTopicToAvoid, validTopicToAvoid],
    competitor_mention_strategy: [validCompetitor],
    judge_score: 7,
    judge_reasoning:
      "Strong specificity on the api_dx talking point, but two Q&A entries lean preachy.",
    judge_dimensions: validDimensions,
    top_fixes: [
      "Replace 'lead-account-opportunity hierarchy' opening with a customer story.",
    ],
  };

  it("parses valid composite brief", () => {
    const parsed = PodcastBriefOutputSchema.parse(validBrief);
    expect(parsed.talking_points).toHaveLength(3);
    expect(parsed.competitor_mention_strategy).toHaveLength(1);
  });

  it("rejects fewer than 3 talking points", () => {
    expect(
      PodcastBriefOutputSchema.safeParse({
        ...validBrief,
        talking_points: [validTalkingPoint, validTalkingPoint],
      }).success,
    ).toBe(false);
  });

  it("rejects fewer than 4 Q&A entries", () => {
    expect(
      PodcastBriefOutputSchema.safeParse({
        ...validBrief,
        anticipated_qa: [validQA, validQA, validQA],
      }).success,
    ).toBe(false);
  });

  it("accepts empty competitor_mention_strategy (min 0)", () => {
    expect(
      PodcastBriefOutputSchema.safeParse({
        ...validBrief,
        competitor_mention_strategy: [],
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Event payload
// ---------------------------------------------------------------------------

describe("PodcastPrepRequestSchema", () => {
  const validRequest = {
    organization_id: "11111111-1111-1111-1111-111111111111",
    podcast_name: "Lenny's Podcast",
    host_name: "Lenny Rachitsky",
    audience: "Senior product managers and product-led growth practitioners",
    episode_topic:
      "How AI is reshaping the role of CRM in modern B2B SaaS GTM motions",
    previous_episode_urls: [
      "https://www.lennyspodcast.com/episodes/example-1",
      "https://www.lennyspodcast.com/episodes/example-2",
    ],
    scheduled_date: "2026-05-15",
    requested_by: null,
  };

  it("parses valid request", () => {
    const parsed = PodcastPrepRequestSchema.parse(validRequest);
    expect(parsed.previous_episode_urls).toHaveLength(2);
  });

  it("defaults previous_episode_urls + scheduled_date when omitted", () => {
    const { previous_episode_urls: _u, scheduled_date: _d, ...without } =
      validRequest;
    const parsed = PodcastPrepRequestSchema.parse(without);
    expect(parsed.previous_episode_urls).toEqual([]);
    expect(parsed.scheduled_date).toBeNull();
  });

  it("rejects more than 3 previous_episode_urls", () => {
    expect(
      PodcastPrepRequestSchema.safeParse({
        ...validRequest,
        previous_episode_urls: [
          "https://a",
          "https://b",
          "https://c",
          "https://d",
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects malformed scheduled_date", () => {
    expect(
      PodcastPrepRequestSchema.safeParse({
        ...validRequest,
        scheduled_date: "May 15, 2026",
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Run stats
// ---------------------------------------------------------------------------

describe("PodcastPrepRunStatsSchema", () => {
  const validStats = {
    function_name: "podcast-prep" as const,
    started_at: "2026-04-26T10:00:00.000Z",
    duration_seconds: 47,
    sections_generated: 5,
    total_llm_calls: 6,
    judge_score: 7,
    cost_usd_cents: 6,
  };

  it("parses valid stats", () => {
    expect(PodcastPrepRunStatsSchema.parse(validStats).function_name).toBe(
      "podcast-prep",
    );
  });

  it("rejects wrong function_name literal", () => {
    expect(
      PodcastPrepRunStatsSchema.safeParse({
        ...validStats,
        function_name: "narrative-simulator",
      }).success,
    ).toBe(false);
  });
});
