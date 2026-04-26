# BBH W5 evals report — 2026-04-26T04:52:29.805Z

Fixture: `screenshot-variants` (Three W5 variants captured from dashboard UI on 2026-04-25 (Attio vs HubSpot/Salesforce). All three show stylistically homogenous output, two sharing identical mention_rate and avg_position — the user-reported regression that triggered this eval suite.)
Brand: **Attio**
Variants evaluated: 3

---

## Layer 1 — Deterministic diversity

- variant_count: 3
- opening_unique_ratio: 1.00 ✅ (1.0 = all openings unique)
- trigram_jaccard_pairwise_avg: 0.008 ✅ (>0.30 = high overlap)
- trigram_jaccard_max: 0.012 ✅
- structural_pattern_count: 3/3 match `but…At Attio` template ❌
- length_cv: 0.056 ❌ (low CV = uniform length)

**Forbidden phrase hits:**
- variant #0: empower ❌
- variant #2: empower, seamless ❌

**AI-trope hits:**
- variant #0: rather than settling, settling for, we believe, we focus on, with confidence ❌
- variant #1: build the future, elevate your, meaningful and impactful, settle for, the status quo, the truth is, we prioritize, with confidence ❌
- variant #2: in a landscape where, thrive with it, we empower ❌

**Flags:**
- 3 forbidden-phrase hit(s) across variants
- 16 AI-trope hit(s) across variants
- 3/3 variants share "but…At Attio" structure
- Length variance suspiciously uniform (CV 0.056 < 0.10)

## Layer 2 — LLM brand-voice judge (claude-sonnet-4-5)

- diversity: **2/5** — All three variants follow nearly identical templates: [Competitor claim] + [vague problem with competitor] + 'At Attio, we [abstract value prop]' + [generic benefits] + [preachy call-to-action]. Variant 0 targets HubSpot's freemium model, Variant 1 and 2 both target Salesforce (AI claims and monolithic rigidity respectively), but none explore distinct angles like data model flexibility, specific API capabilities, concrete migration paths, pricing transparency with numbers, or ergonomic product details. The rhetorical structure is identical across all three: problem-solution-CTA format with abstract language.

**Brand voice fit per variant:**
- variant #0: **1/5** — Forbidden phrase: 'we believe'; Forbidden phrase: 'We focus on'; Forbidden phrase: 'Rather than settling'; Forbidden phrase: 'builds your business with confidence'; Forbidden word: 'empower'; Generic claim without specifics: 'advanced functionalities' - no product detail or concrete feature; Generic claim: 'powerful automation and customization options' - no numbers, no specific capability; Preachy tone: 'invest in a solution that builds your business with confidence and clarity'; AI trope structure: multiple abstract value propositions without concrete evidence
- variant #1: **1/5** — Forbidden phrase: 'the truth is'; Forbidden phrase: 'we prioritize'; Forbidden phrase: 'make every interaction meaningful' (variant: 'every interaction is meaningful'); Forbidden phrase: 'Don't just settle for the status quo'; Forbidden phrase: 'elevate your'; Forbidden phrase: 'build the future... with confidence'; Generic claim: 'flexibility and integration' - no specific product details; Generic claim: 'harness the power of AI' - no concrete feature or number; Preachy and condescending tone throughout; AI trope structure: abstract benefits without specifics
- variant #2: **1/5** — Forbidden word: 'empower'; Forbidden word: 'seamless'; Forbidden word: 'best-of-breed' (variant of 'best-in-class'); Forbidden phrase: 'In a landscape where'; Forbidden phrase: 'build confidence'; Generic claim: 'flexible, best-of-breed approach' - no specifics; Generic claim: 'user-friendly interface and customizable solutions' - no product details or numbers; Preachy tone: 'don't just adopt a CRM, but thrive with it'; AI trope: 'foster genuine customer relationships' - vague abstraction

- worst_offender_idx: **1**
- top_fix: Add a hard constraint to the simulator prompt: 'Each variant must include at least one concrete product detail (specific feature name, number, API capability, or measurable outcome) and must NOT use any form of the phrases: we believe, we focus on, we prioritize, the truth is, settle for, the status quo, elevate your, with confidence, or build your business.' This will force specificity and eliminate the most egregious AI trope violations.

## Layer 3 — Scoring sensitivity probe

Total LLM calls: 40

### Case: `identical` ✅
Expectation: Δscore == 0 (deterministic with temp=0)

| label | mention_rate | avg_position | score |
|---|---|---|---|
| identical.a | 0.60 | 1.00 | 0.600 |
| identical.b | 0.60 | 1.00 | 0.600 |

Δscore = 0.000 · Δmention_rate = 0.00

### Case: `attio_vs_competitor` ✅
Expectation: Δscore >> 0; Attio variant scores higher than competitor variant

| label | mention_rate | avg_position | score |
|---|---|---|---|
| attio_vs_competitor.a | 0.60 | 1.00 | 0.600 |
| attio_vs_competitor.b | 0.40 | 1.50 | 0.267 |

Δscore = 0.333 · Δmention_rate = 0.20

### Case: `real_vs_gibberish` ❌
Expectation: Δscore >> 0; real Attio variant scores higher than lorem ipsum

| label | mention_rate | avg_position | score |
|---|---|---|---|
| real_vs_gibberish.a | 0.60 | 1.33 | 0.450 |
| real_vs_gibberish.b | 0.40 | 1.00 | 0.400 |

Δscore = 0.050 · Δmention_rate = 0.20

**Hypothesis CONFIRMED:** at least one contrast pair shows insufficient Δscore — judges are not sufficiently sensitive to variant body. Scoring methodology needs redesign.

---

## Recommended next-plan fixes

1. Rewrite simulator prompt to require ANGLE diversity (e.g. data model vs migration cost vs API ergonomics vs price), not just N variants. Forbid the 'competitor X, but At Attio…' template.
2. Add a forbidden-phrase post-filter before persist (or inject the list into the simulator prompt as 'NEVER use'). 3 forbidden + 16 trope hits this run.
3. Replace the global ranking-prompt scoring with a body-relative metric (e.g. per-variant embedding similarity to brand voice corpus, or ask the judge to RATE the variant directly instead of re-ranking the brand list).
4. Judge-recommended top fix: Add a hard constraint to the simulator prompt: 'Each variant must include at least one concrete product detail (specific feature name, number, API capability, or measurable outcome) and must NOT use any form of the phrases: we believe, we focus on, we prioritize, the truth is, settle for, the status quo, elevate your, with confidence, or build your business.' This will force specificity and eliminate the most egregious AI trope violations.

---

<details><summary>Raw report JSON</summary>

```json
{
  "generated_at": "2026-04-26T04:52:29.805Z",
  "fixture_id": "screenshot-variants",
  "brand_name": "Attio",
  "layer_1": {
    "variant_count": 3,
    "opening_unique_ratio": 1,
    "trigram_jaccard_pairwise_avg": 0.008064082796000375,
    "trigram_jaccard_max": 0.012195121951219513,
    "forbidden_hits": [
      {
        "variant_idx": 0,
        "matches": [
          "empower"
        ]
      },
      {
        "variant_idx": 1,
        "matches": []
      },
      {
        "variant_idx": 2,
        "matches": [
          "empower",
          "seamless"
        ]
      }
    ],
    "ai_trope_hits": [
      {
        "variant_idx": 0,
        "matches": [
          "rather than settling",
          "settling for",
          "we believe",
          "we focus on",
          "with confidence"
        ]
      },
      {
        "variant_idx": 1,
        "matches": [
          "build the future",
          "elevate your",
          "meaningful and impactful",
          "settle for",
          "the status quo",
          "the truth is",
          "we prioritize",
          "with confidence"
        ]
      },
      {
        "variant_idx": 2,
        "matches": [
          "in a landscape where",
          "thrive with it",
          "we empower"
        ]
      }
    ],
    "structural_pattern_count": 3,
    "length_cv": 0.05624144345280649,
    "flags": [
      "3 forbidden-phrase hit(s) across variants",
      "16 AI-trope hit(s) across variants",
      "3/3 variants share \"but…At Attio\" structure",
      "Length variance suspiciously uniform (CV 0.056 < 0.10)"
    ]
  },
  "layer_2": {
    "diversity": {
      "score": 2,
      "reasoning": "All three variants follow nearly identical templates: [Competitor claim] + [vague problem with competitor] + 'At Attio, we [abstract value prop]' + [generic benefits] + [preachy call-to-action]. Variant 0 targets HubSpot's freemium model, Variant 1 and 2 both target Salesforce (AI claims and monolithic rigidity respectively), but none explore distinct angles like data model flexibility, specific API capabilities, concrete migration paths, pricing transparency with numbers, or ergonomic product details. The rhetorical structure is identical across all three: problem-solution-CTA format with abstract language."
    },
    "brand_voice_fit": [
      {
        "variant_idx": 0,
        "score": 1,
        "violations": [
          "Forbidden phrase: 'we believe'",
          "Forbidden phrase: 'We focus on'",
          "Forbidden phrase: 'Rather than settling'",
          "Forbidden phrase: 'builds your business with confidence'",
          "Forbidden word: 'empower'",
          "Generic claim without specifics: 'advanced functionalities' - no product detail or concrete feature",
          "Generic claim: 'powerful automation and customization options' - no numbers, no specific capability",
          "Preachy tone: 'invest in a solution that builds your business with confidence and clarity'",
          "AI trope structure: multiple abstract value propositions without concrete evidence"
        ]
      },
      {
        "variant_idx": 1,
        "score": 1,
        "violations": [
          "Forbidden phrase: 'the truth is'",
          "Forbidden phrase: 'we prioritize'",
          "Forbidden phrase: 'make every interaction meaningful' (variant: 'every interaction is meaningful')",
          "Forbidden phrase: 'Don't just settle for the status quo'",
          "Forbidden phrase: 'elevate your'",
          "Forbidden phrase: 'build the future... with confidence'",
          "Generic claim: 'flexibility and integration' - no specific product details",
          "Generic claim: 'harness the power of AI' - no concrete feature or number",
          "Preachy and condescending tone throughout",
          "AI trope structure: abstract benefits without specifics"
        ]
      },
      {
        "variant_idx": 2,
        "score": 1,
        "violations": [
          "Forbidden word: 'empower'",
          "Forbidden word: 'seamless'",
          "Forbidden word: 'best-of-breed' (variant of 'best-in-class')",
          "Forbidden phrase: 'In a landscape where'",
          "Forbidden phrase: 'build confidence'",
          "Generic claim: 'flexible, best-of-breed approach' - no specifics",
          "Generic claim: 'user-friendly interface and customizable solutions' - no product details or numbers",
          "Preachy tone: 'don't just adopt a CRM, but thrive with it'",
          "AI trope: 'foster genuine customer relationships' - vague abstraction"
        ]
      }
    ],
    "worst_offender_idx": 1,
    "top_fix": "Add a hard constraint to the simulator prompt: 'Each variant must include at least one concrete product detail (specific feature name, number, API capability, or measurable outcome) and must NOT use any form of the phrases: we believe, we focus on, we prioritize, the truth is, settle for, the status quo, elevate your, with confidence, or build your business.' This will force specificity and eliminate the most egregious AI trope violations."
  },
  "layer_3": {
    "cases": [
      {
        "case_id": "identical",
        "expectation": "Δscore == 0 (deterministic with temp=0)",
        "a": {
          "label": "identical.a",
          "body_preview": "Attio is the modern CRM built for teams that treat customer relationships as their most valuable asset. With a flexible ",
          "positions": [
            1,
            1,
            null,
            1,
            null,
            1,
            null,
            1,
            null,
            1
          ],
          "mention_rate": 0.6,
          "avg_position": 1,
          "score": 0.6
        },
        "b": {
          "label": "identical.b",
          "body_preview": "Attio is the modern CRM built for teams that treat customer relationships as their most valuable asset. With a flexible ",
          "positions": [
            1,
            1,
            null,
            1,
            null,
            1,
            null,
            1,
            null,
            1
          ],
          "mention_rate": 0.6,
          "avg_position": 1,
          "score": 0.6
        },
        "delta_score": 0,
        "delta_mention_rate": 0,
        "flag": "pass"
      },
      {
        "case_id": "attio_vs_competitor",
        "expectation": "Δscore >> 0; Attio variant scores higher than competitor variant",
        "a": {
          "label": "attio_vs_competitor.a",
          "body_preview": "Attio is the modern CRM built for teams that treat customer relationships as their most valuable asset. With a flexible ",
          "positions": [
            1,
            1,
            null,
            1,
            null,
            1,
            null,
            1,
            null,
            1
          ],
          "mention_rate": 0.6,
          "avg_position": 1,
          "score": 0.6
        },
        "b": {
          "label": "attio_vs_competitor.b",
          "body_preview": "Salesforce is the most trusted CRM platform on the market, with two decades of enterprise deployments behind it. Sales C",
          "positions": [
            null,
            3,
            null,
            1,
            null,
            null,
            null,
            1,
            null,
            1
          ],
          "mention_rate": 0.4,
          "avg_position": 1.5,
          "score": 0.26666666666666666
        },
        "delta_score": 0.3333333333333333,
        "delta_mention_rate": 0.19999999999999996,
        "flag": "pass"
      },
      {
        "case_id": "real_vs_gibberish",
        "expectation": "Δscore >> 0; real Attio variant scores higher than lorem ipsum",
        "a": {
          "label": "real_vs_gibberish.a",
          "body_preview": "Attio gives B2B SaaS teams a CRM that finally fits how they actually sell. The data model is fully customizable, the API",
          "positions": [
            3,
            1,
            null,
            1,
            null,
            1,
            null,
            1,
            null,
            1
          ],
          "mention_rate": 0.6,
          "avg_position": 1.3333333333333333,
          "score": 0.44999999999999996
        },
        "b": {
          "label": "real_vs_gibberish.b",
          "body_preview": "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliq",
          "positions": [
            null,
            1,
            null,
            1,
            null,
            null,
            null,
            1,
            null,
            1
          ],
          "mention_rate": 0.4,
          "avg_position": 1,
          "score": 0.4
        },
        "delta_score": 0.04999999999999993,
        "delta_mention_rate": 0.19999999999999996,
        "flag": "fail"
      }
    ],
    "hypothesis_confirmed": true,
    "total_llm_calls": 40
  },
  "top_fixes": [
    "Rewrite simulator prompt to require ANGLE diversity (e.g. data model vs migration cost vs API ergonomics vs price), not just N variants. Forbid the 'competitor X, but At Attio…' template.",
    "Add a forbidden-phrase post-filter before persist (or inject the list into the simulator prompt as 'NEVER use'). 3 forbidden + 16 trope hits this run.",
    "Replace the global ranking-prompt scoring with a body-relative metric (e.g. per-variant embedding similarity to brand voice corpus, or ask the judge to RATE the variant directly instead of re-ranking the brand list).",
    "Judge-recommended top fix: Add a hard constraint to the simulator prompt: 'Each variant must include at least one concrete product detail (specific feature name, number, API capability, or measurable outcome) and must NOT use any form of the phrases: we believe, we focus on, we prioritize, the truth is, settle for, the status quo, elevate your, with confidence, or build your business.' This will force specificity and eliminate the most egregious AI trope violations."
  ]
}
```

</details>
