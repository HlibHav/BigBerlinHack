import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/anthropic", () => ({
  generateObjectAnthropic: vi.fn(),
}));
vi.mock("server-only", () => ({}));

import { generateObjectAnthropic } from "@/lib/services/anthropic";
import {
  judgePodcastBrief,
  PodcastJudgeOutputSchema,
} from "@/lib/services/podcast-judge";

const mockedGenerate = vi.mocked(generateObjectAnthropic);

beforeEach(() => {
  mockedGenerate.mockReset();
});

const baseInput = {
  brand_name: "Attio",
  brand_voice_pillars: ["confident-builder"],
  podcast_name: "Lenny's Podcast",
  host_name: "Lenny Rachitsky",
  audience: "Senior PMs and PLG practitioners interested in AI tooling",
  episode_topic: "How AI is reshaping the role of CRM in modern B2B SaaS",
  organization_id: "org-test-id",
  talking_points: [
    {
      headline: "Attio's flexible data model fits B2B SaaS workflows",
      proof_point: "30% reduction in admin overhead from pilot",
      suggested_phrasing:
        "Most modern SaaS teams have already outgrown the lead-account-opportunity hierarchy by month six.",
      retrievability_score: 8,
      retrievability_reasoning: "Distinctive phrase + concrete number",
      maps_to_prompt: "best CRM for B2B SaaS teams",
    },
  ],
  anticipated_qa: [
    {
      question: "How does Attio compare to Salesforce for fast-growing teams?",
      suggested_answer:
        "Salesforce optimizes for governance at 5000 seats. Below that, the admin cost outpaces the value. Attio inverts that with a flexible data model and 10-day migration.",
      why_host_asks: "Salesforce is the default reference",
      pitfall: "Avoid disparaging Salesforce",
    },
  ],
  brand_drop_moments: [
    {
      trigger: "When host asks about your tech stack or daily tools",
      suggested_mention:
        "We run customer ops out of Attio with two custom objects built in week one",
      specificity_boost: "Operational detail anchors the claim",
    },
  ],
  topics_to_avoid: [
    {
      topic: "Specific competitor pricing tier comparisons",
      risk: "Pricing pages change weekly; risks being outdated by airdate",
      pivot: "Redirect to your own pricing philosophy",
    },
  ],
  competitor_mention_strategy: [
    {
      competitor_name: "Salesforce",
      when_ok_to_name:
        "When host explicitly asks about market context or migration paths",
      when_use_generic:
        "When making positioning claims that risk sounding petty",
      suggested_generic_phrasing: ["legacy CRMs", "first-generation enterprise CRM"],
      risk_if_mishandled:
        "Explicit Salesforce mention boosts their visibility in the resulting transcript",
    },
  ],
};

describe("judgePodcastBrief", () => {
  it("calls generateObjectAnthropic with expected operation, model, temperature", async () => {
    mockedGenerate.mockResolvedValueOnce({
      object: {
        judge_score: 7,
        judge_reasoning:
          "Strong specificity in the talking point and Q&A; brand-drop moment grounded in operational detail.",
        judge_dimensions: {
          retrievability: 7,
          naturality: 8,
          specificity: 7,
          coverage: 7,
        },
        top_fixes: ["Tighten Q&A answer to under 100 words"],
      },
      usage: { promptTokens: 800, completionTokens: 300, totalTokens: 1100 },
    });

    const { output, usage } = await judgePodcastBrief(baseInput);

    expect(mockedGenerate).toHaveBeenCalledOnce();
    const call = mockedGenerate.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-5");
    expect(call.temperature).toBe(0);
    expect(call.operation).toBe("podcast-prep:judge");
    expect(call.organization_id).toBe("org-test-id");

    // System prompt mentions brand + AI-SEO framing
    expect(call.system).toMatch(/Attio/);
    expect(call.system).toMatch(/AI engines/);
    expect(call.system).toMatch(/confident-builder/);

    // Prompt embeds podcast metadata + each section
    expect(call.prompt).toMatch(/Lenny/);
    expect(call.prompt).toMatch(/Talking points/);
    expect(call.prompt).toMatch(/Anticipated Q&A/);
    expect(call.prompt).toMatch(/Brand-drop moments/);
    expect(call.prompt).toMatch(/Topics to avoid/);
    expect(call.prompt).toMatch(/Competitor mention strategy/);

    expect(output.judge_score).toBe(7);
    expect(output.judge_dimensions.retrievability).toBe(7);
    expect(usage.totalTokens).toBe(1100);
  });

  it("renders '(none)' for empty competitor_mention_strategy", async () => {
    mockedGenerate.mockResolvedValueOnce({
      object: {
        judge_score: 6,
        judge_reasoning:
          "Brief is OK but lacks competitor mention strategy guidance.",
        judge_dimensions: {
          retrievability: 6,
          naturality: 7,
          specificity: 6,
          coverage: 5,
        },
        top_fixes: [
          "Add at least one competitor mention strategy entry to guide founder",
        ],
      },
      usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
    });

    await judgePodcastBrief({ ...baseInput, competitor_mention_strategy: [] });

    const call = mockedGenerate.mock.calls[0][0];
    expect(call.prompt).toMatch(/Competitor mention strategy \(0\)/);
    expect(call.prompt).toMatch(/\(none\)/);
  });

  it("schema rejects judge_score above 10", () => {
    const bad = PodcastJudgeOutputSchema.safeParse({
      judge_score: 11,
      judge_reasoning: "out of range overall score should fail validation here",
      judge_dimensions: {
        retrievability: 5,
        naturality: 5,
        specificity: 5,
        coverage: 5,
      },
      top_fixes: [],
    });
    expect(bad.success).toBe(false);
  });

  it("schema rejects too-short judge_reasoning", () => {
    const bad = PodcastJudgeOutputSchema.safeParse({
      judge_score: 5,
      judge_reasoning: "too short",
      judge_dimensions: {
        retrievability: 5,
        naturality: 5,
        specificity: 5,
        coverage: 5,
      },
      top_fixes: [],
    });
    expect(bad.success).toBe(false);
  });

  it("schema rejects more than 5 top_fixes", () => {
    const bad = PodcastJudgeOutputSchema.safeParse({
      judge_score: 5,
      judge_reasoning: "long enough reasoning satisfies the schema validator",
      judge_dimensions: {
        retrievability: 5,
        naturality: 5,
        specificity: 5,
        coverage: 5,
      },
      top_fixes: [
        "fix one with at least ten chars",
        "fix two with at least ten chars",
        "fix three with at least ten chars",
        "fix four with at least ten chars",
        "fix five with at least ten chars",
        "fix six with at least ten chars",
      ],
    });
    expect(bad.success).toBe(false);
  });
});
