// SSOT for Inngest event payloads. Per CONTRACTS.md §1 + §0 conventions:
// every Inngest send must reference a schema declared here. No inline z.object
// allowed in Inngest functions or route handlers.
import { z } from "zod";

// ACTIVE — W6′ Slack morning brief (uses MorningBriefTick з call_preference="markdown" path).
// Hackathon path: Slack send via webhook (per features/morning-brief.md).
// Voice path (telli/tts/elevenlabs) — [DEFERRED post-hackathon].
export const MorningBriefTick = z.object({
  organization_id: z.string().uuid(),
  run_window_start: z.string().datetime(),
  call_preference: z.enum(["voice-agent", "tts", "markdown"]),
});
export type MorningBriefTick = z.infer<typeof MorningBriefTick>;

// ACTIVE — W9 competitor radar.
export const CompetitorRadarTick = z.object({
  organization_id: z.string().uuid(),
  sweep_window_hours: z.number().int().positive().default(6),
  sources_override: z.array(z.string().url()).optional(),
});
export type CompetitorRadarTick = z.infer<typeof CompetitorRadarTick>;

// ACTIVE — W5 narrative simulator.
export const NarrativeSimulateRequest = z.object({
  organization_id: z.string().uuid(),
  seed_type: z.enum(["competitor-move", "user-prompt"]),
  seed_payload: z.record(z.unknown()),
  requested_by: z.string().uuid().nullable(),
  num_variants: z.number().int().min(1).max(5).default(3),
});
export type NarrativeSimulateRequest = z.infer<typeof NarrativeSimulateRequest>;

// ACTIVE — W7 multi-channel content expansion (counter-draft → blog/x/linkedin).
export const ContentExpandRequest = z.object({
  organization_id: z.string().uuid(),
  parent_counter_draft_id: z.string().uuid(),
});
export type ContentExpandRequest = z.infer<typeof ContentExpandRequest>;

// [DEFERRED — W4 widget cut by hackathon scope, schema preserved for post-hackathon]
export const WidgetRegenerate = z.object({
  organization_id: z.string().uuid(),
  reason: z.enum(["new-snapshot", "manual", "schedule"]),
});
export type WidgetRegenerate = z.infer<typeof WidgetRegenerate>;

// [DEFERRED — W6 voice path cut, schema preserved for post-hackathon Telli reactivation]
export const MorningBriefDelivered = z.object({
  organization_id: z.string().uuid(),
  run_id: z.string().uuid(),
  provider: z.enum(["telli", "elevenlabs", "markdown"]),
  outcome: z.enum(["answered", "voicemail", "failed"]),
  duration_seconds: z.number().int().nullable(),
});
export type MorningBriefDelivered = z.infer<typeof MorningBriefDelivered>;

// Inngest's EventSchemas.fromZod() expects each event keyed by name with `{ data: ZodObject }`
// shape (Inngest wraps event payload inside `data`). Per https://www.inngest.com/docs/typescript.
export const events = {
  "morning-brief.tick": { data: MorningBriefTick },
  "morning-brief.delivered": { data: MorningBriefDelivered },
  "competitor-radar.tick": { data: CompetitorRadarTick },
  "narrative.simulate-request": { data: NarrativeSimulateRequest },
  "content.expand-request": { data: ContentExpandRequest },
  "widget.regenerate": { data: WidgetRegenerate },
} as const;

export type EventName = keyof typeof events;
