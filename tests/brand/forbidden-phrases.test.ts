import { describe, expect, it } from "vitest";

import {
  AI_TROPE_PHRASES,
  countForbiddenHits,
  findForbiddenHits,
  FORBIDDEN_WORDS,
  renderForbiddenListForPrompt,
} from "@/lib/brand/forbidden-phrases";

describe("forbidden-phrases module", () => {
  it("exposes the canonical forbidden vocabulary", () => {
    expect(FORBIDDEN_WORDS).toContain("empower");
    expect(FORBIDDEN_WORDS).toContain("seamless");
    expect(FORBIDDEN_WORDS).toContain("leverage");
    // Stems that catch family of words
    expect(FORBIDDEN_WORDS).toContain("revolutioniz");
    expect(AI_TROPE_PHRASES).toContain("we believe");
    expect(AI_TROPE_PHRASES).toContain("settle for");
    expect(AI_TROPE_PHRASES).toContain("the status quo");
  });

  it("findForbiddenHits returns deduplicated, sorted matches", () => {
    const body =
      "We believe that we empower teams to navigate seamlessly. We empower again. Empowerment is key.";
    const { forbidden_words, ai_tropes } = findForbiddenHits(body);
    // "empower" stem catches empower / empowerment etc — but our list also has
    // "empowering" / "empowers" as standalone entries; only ones that hit this
    // body should appear.
    expect(forbidden_words).toContain("empower");
    expect(forbidden_words).toContain("seamlessly");
    expect(forbidden_words).toContain("navigate");
    // Sorted ascending
    expect(forbidden_words).toEqual([...forbidden_words].sort());
    expect(ai_tropes).toContain("we believe");
    expect(ai_tropes).toContain("we empower");
    expect(ai_tropes).toEqual([...ai_tropes].sort());
  });

  it("findForbiddenHits is empty for clean prose", () => {
    const body =
      "Attio gives B2B SaaS teams a CRM that fits how they actually sell. The data model is fully customizable and the API is real-time. Migrate in two weeks with zero data loss and a measurable drop in admin overhead.";
    const { forbidden_words, ai_tropes } = findForbiddenHits(body);
    expect(forbidden_words).toEqual([]);
    expect(ai_tropes).toEqual([]);
  });

  it("countForbiddenHits sums both lists", () => {
    const body = "We believe in seamless workflows where we empower the team.";
    const total = countForbiddenHits(body);
    const { forbidden_words, ai_tropes } = findForbiddenHits(body);
    expect(total).toBe(forbidden_words.length + ai_tropes.length);
    expect(total).toBeGreaterThan(2);
  });

  it("renderForbiddenListForPrompt produces a stable, prompt-ready block", () => {
    const out = renderForbiddenListForPrompt();
    expect(out).toMatch(/Forbidden words/);
    expect(out).toMatch(/Forbidden phrases/);
    expect(out).toContain('"empower"');
    expect(out).toContain('"we believe"');
    // Stable rendering — same input returns identical string for cache hits.
    expect(out).toEqual(renderForbiddenListForPrompt());
  });
});
