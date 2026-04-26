import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the production Anthropic wrapper so the test doesn't make real calls.
// We assert on the call shape and feed the wrapper's return value back through
// the variant-judge schema validator.
vi.mock("@/lib/services/anthropic", () => ({
  generateObjectAnthropic: vi.fn(),
}));

// `server-only` is allowed in vitest because the file just throws when bundled
// for the browser; in Node test runner it's a no-op import.
vi.mock("server-only", () => ({}));

import { generateObjectAnthropic } from "@/lib/services/anthropic";
import {
  judgeVariants,
  JudgeOutputSchema,
} from "@/lib/services/variant-judge";

const mockedGenerate = vi.mocked(generateObjectAnthropic);

beforeEach(() => {
  mockedGenerate.mockReset();
});

describe("judgeVariants", () => {
  const baseInput = {
    brand_name: "Attio",
    brand_voice_pillars: ["confident-builder"],
    organization_id: "org-test",
    variants: [
      { idx: 0, body: "Variant zero body that exceeds fifty characters easily." },
      { idx: 1, body: "Variant one body that also exceeds the fifty character minimum." },
    ],
  };

  it("calls generateObjectAnthropic with the expected operation and zero temperature", async () => {
    mockedGenerate.mockResolvedValueOnce({
      object: {
        verdicts: [
          {
            idx: 0,
            judge_score: 7,
            judge_reasoning: "Solid specificity, decent persuasion, fair angle.",
            dimensions: { specificity: 7, brand_voice: 7, persuasiveness: 7, differentiation: 6 },
          },
          {
            idx: 1,
            judge_score: 4,
            judge_reasoning: "Generic claims, weak proof points, ai-tropes present.",
            dimensions: { specificity: 3, brand_voice: 4, persuasiveness: 5, differentiation: 4 },
          },
        ],
        set_diversity_score: 6,
        set_diversity_reasoning: "Two angles meaningfully distinct but not wildly different.",
      },
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    });

    const { output, usage } = await judgeVariants(baseInput);

    expect(mockedGenerate).toHaveBeenCalledOnce();
    const call = mockedGenerate.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-5");
    expect(call.temperature).toBe(0);
    expect(call.operation).toBe("narrative-simulator:judge");
    expect(call.organization_id).toBe("org-test");
    // System prompt mentions brand and pillars
    expect(call.system).toMatch(/Attio/);
    expect(call.system).toMatch(/confident-builder/);
    // Prompt embeds both variant bodies
    expect(call.prompt).toMatch(/idx=0/);
    expect(call.prompt).toMatch(/idx=1/);

    // Output flows through the schema and stays sorted by idx
    expect(output.verdicts.map((v) => v.idx)).toEqual([0, 1]);
    expect(output.verdicts[0].judge_score).toBe(7);
    expect(output.verdicts[1].judge_score).toBe(4);
    expect(usage.totalTokens).toBe(300);
  });

  it("re-sorts verdicts by idx even if judge returns them out of order", async () => {
    mockedGenerate.mockResolvedValueOnce({
      object: {
        verdicts: [
          {
            idx: 1,
            judge_score: 8,
            judge_reasoning: "Strong proof points and a fresh angle that lands.",
            dimensions: { specificity: 9, brand_voice: 7, persuasiveness: 8, differentiation: 8 },
          },
          {
            idx: 0,
            judge_score: 5,
            judge_reasoning: "Adequate but predictable structure.",
            dimensions: { specificity: 5, brand_voice: 6, persuasiveness: 5, differentiation: 4 },
          },
        ],
        set_diversity_score: 7,
        set_diversity_reasoning: "Variants take genuinely different angles.",
      },
      usage: { promptTokens: 80, completionTokens: 160, totalTokens: 240 },
    });

    const { output } = await judgeVariants(baseInput);
    expect(output.verdicts.map((v) => v.idx)).toEqual([0, 1]);
  });

  it("throws on empty variants array (early guard)", async () => {
    await expect(
      judgeVariants({ ...baseInput, variants: [] }),
    ).rejects.toThrow(/no variants/);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("schema rejects judge_score outside 1-10", () => {
    const bad = JudgeOutputSchema.safeParse({
      verdicts: [
        {
          idx: 0,
          judge_score: 11,
          judge_reasoning: "Out of range, should fail validation.",
          dimensions: { specificity: 5, brand_voice: 5, persuasiveness: 5, differentiation: 5 },
        },
      ],
      set_diversity_score: 5,
      set_diversity_reasoning: "Reasoning string here for validation.",
    });
    expect(bad.success).toBe(false);
  });

  it("schema rejects judge_reasoning shorter than 30 chars", () => {
    const bad = JudgeOutputSchema.safeParse({
      verdicts: [
        {
          idx: 0,
          judge_score: 5,
          judge_reasoning: "too short",
          dimensions: { specificity: 5, brand_voice: 5, persuasiveness: 5, differentiation: 5 },
        },
      ],
      set_diversity_score: 5,
      set_diversity_reasoning: "Adequately long reasoning here.",
    });
    expect(bad.success).toBe(false);
  });
});
