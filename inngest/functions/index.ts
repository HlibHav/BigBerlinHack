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

import { competitorRadar, competitorRadarSchedule } from "./competitor-radar";
import { contentExpand } from "./content-expand";
import { narrativeSimulator } from "./narrative-simulator";
import { morningBrief, morningBriefSchedule } from "./morning-brief";
import { podcastPrep } from "./podcast-prep";
import { prelaunchCheck } from "./prelaunch-check";

export {
  competitorRadar,
  competitorRadarSchedule,
  contentExpand,
  narrativeSimulator,
  morningBrief,
  morningBriefSchedule,
  podcastPrep,
  prelaunchCheck,
};

export const functions = [
  competitorRadar,
  competitorRadarSchedule,
  contentExpand,
  narrativeSimulator,
  morningBrief,
  morningBriefSchedule,
  podcastPrep,
  prelaunchCheck,
] as const;
