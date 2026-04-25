/**
 * Barrel export for all Inngest functions.
 *
 * Functions wired here are auto-registered via app/api/inngest/route.ts on Vercel deploy.
 *
 * Active (per `decisions/2026-04-25-hackathon-scope-cut.md`):
 * - W9 competitor-radar
 * - W5 narrative-simulator
 * - W7 content-expand
 * - W6′ morning-brief (Slack send)
 *
 * Deferred (post-hackathon):
 * - W4 widget-regenerate
 * - W6 morning-brief-voice (Telli/ElevenLabs)
 */

// Wave F populates these:
// export { competitorRadar } from "./competitor-radar";
// export { narrativeSimulator } from "./narrative-simulator";
// export { contentExpand } from "./content-expand";
// export { morningBrief } from "./morning-brief";

export const functions = [
  // populated by Wave F worktree agents
] as const;
