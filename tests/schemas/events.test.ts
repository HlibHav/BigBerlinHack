import { describe, it, expect } from "vitest";

import {
  CompetitorRadarTick,
  ContentExpandRequest,
  events,
  MorningBriefDelivered,
  MorningBriefTick,
  NarrativeSimulateRequest,
  PrelaunchCheckRequest,
  WidgetRegenerate,
} from "@/lib/events";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

describe("events registry", () => {
  it("contains exactly the documented event names", () => {
    expect(Object.keys(events).sort()).toEqual(
      [
        "competitor-radar.tick",
        "content.expand-request",
        "morning-brief.delivered",
        "morning-brief.tick",
        "narrative.simulate-request",
        "podcast.prep-request",
        "prelaunch.check-request",
        "widget.regenerate",
      ].sort(),
    );
  });
});

describe("PrelaunchCheckRequest", () => {
  it("parses valid request", () => {
    const parsed = PrelaunchCheckRequest.parse({
      organization_id: ORG_ID,
      brand_slug: "attio",
      draft_phrasing: "AI-native CRM for founders",
      requested_by: null,
      check_id: RUN_ID,
    });
    expect(parsed.brand_slug).toBe("attio");
  });

  it("rejects draft_phrasing < 10 chars", () => {
    const result = PrelaunchCheckRequest.safeParse({
      organization_id: ORG_ID,
      brand_slug: "attio",
      draft_phrasing: "short",
      requested_by: null,
      check_id: RUN_ID,
    });
    expect(result.success).toBe(false);
  });
});

describe("MorningBriefTick", () => {
  it("parses valid markdown-mode tick", () => {
    const parsed = MorningBriefTick.parse({
      organization_id: ORG_ID,
      run_window_start: "2026-04-25T08:00:00.000Z",
      call_preference: "markdown",
    });
    expect(parsed.call_preference).toBe("markdown");
  });

  it("rejects unknown call_preference", () => {
    const result = MorningBriefTick.safeParse({
      organization_id: ORG_ID,
      run_window_start: "2026-04-25T08:00:00.000Z",
      call_preference: "carrier-pigeon",
    });
    expect(result.success).toBe(false);
  });
});

describe("CompetitorRadarTick", () => {
  it("applies sweep_window_hours default", () => {
    const parsed = CompetitorRadarTick.parse({ organization_id: ORG_ID });
    expect(parsed.sweep_window_hours).toBe(6);
  });

  it("rejects non-positive sweep_window_hours", () => {
    const result = CompetitorRadarTick.safeParse({
      organization_id: ORG_ID,
      sweep_window_hours: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("NarrativeSimulateRequest", () => {
  it("applies num_variants default", () => {
    const parsed = NarrativeSimulateRequest.parse({
      organization_id: ORG_ID,
      seed_type: "user-prompt",
      seed_payload: { text: "compare attio vs hubspot" },
      requested_by: null,
    });
    expect(parsed.num_variants).toBe(3);
  });

  it("rejects num_variants > 5", () => {
    const result = NarrativeSimulateRequest.safeParse({
      organization_id: ORG_ID,
      seed_type: "user-prompt",
      seed_payload: {},
      requested_by: null,
      num_variants: 6,
    });
    expect(result.success).toBe(false);
  });
});

describe("ContentExpandRequest", () => {
  it("parses valid expand request", () => {
    const parsed = ContentExpandRequest.parse({
      organization_id: ORG_ID,
      parent_counter_draft_id: RUN_ID,
    });
    expect(parsed.parent_counter_draft_id).toBe(RUN_ID);
  });

  it("rejects non-uuid parent_counter_draft_id", () => {
    const result = ContentExpandRequest.safeParse({
      organization_id: ORG_ID,
      parent_counter_draft_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("WidgetRegenerate [DEFERRED]", () => {
  it("parses valid trigger", () => {
    const parsed = WidgetRegenerate.parse({
      organization_id: ORG_ID,
      reason: "manual",
    });
    expect(parsed.reason).toBe("manual");
  });

  it("rejects invalid reason", () => {
    const result = WidgetRegenerate.safeParse({
      organization_id: ORG_ID,
      reason: "vibes",
    });
    expect(result.success).toBe(false);
  });
});

describe("MorningBriefDelivered [DEFERRED]", () => {
  it("parses delivered payload з telli provider", () => {
    const parsed = MorningBriefDelivered.parse({
      organization_id: ORG_ID,
      run_id: RUN_ID,
      provider: "telli",
      outcome: "answered",
      duration_seconds: 42,
    });
    expect(parsed.outcome).toBe("answered");
  });

  it("rejects invalid outcome value", () => {
    const result = MorningBriefDelivered.safeParse({
      organization_id: ORG_ID,
      run_id: RUN_ID,
      provider: "markdown",
      outcome: "ghosted",
      duration_seconds: null,
    });
    expect(result.success).toBe(false);
  });
});
