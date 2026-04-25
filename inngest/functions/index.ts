/**
 * Barrel export for all Inngest functions.
 * Wired у app/api/inngest/route.ts via `serve({ functions })`.
 *
 * Active (per `decisions/2026-04-25-hackathon-scope-cut.md`):
 * - W9 competitor-radar
 * - W5 narrative-simulator
 * - W7 content-expand
 * - W6′ morning-brief (Slack send)
 *
 * Deferred (post-hackathon): W4 widget-regenerate, W6 morning-brief-voice (Telli/ElevenLabs).
 */

import { competitorRadar } from "./competitor-radar";
import { contentExpand } from "./content-expand";
import { narrativeSimulator } from "./narrative-simulator";
import { morningBrief } from "./morning-brief";

export { competitorRadar, contentExpand, narrativeSimulator, morningBrief };

export const functions = [
  competitorRadar,
  contentExpand,
  narrativeSimulator,
  morningBrief,
] as const;
