import "server-only";

import { inngest } from "@/inngest/client";
import type { Json } from "@/lib/supabase/types";
import {
  ContentExpansionOutputSchema,
  type ContentVariant,
  ContentVariantSchema,
} from "@/lib/schemas/content-variant";
import { ContentExpandRunStatsSchema } from "@/lib/schemas/run-stats";
import { generateObjectAnthropic } from "@/lib/services/anthropic";
import { sumRunCost } from "@/lib/services/cost";
import { generateObjectOpenAI } from "@/lib/services/openai";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * W7 — Multi-channel content expansion.
 *
 * Trigger: `content.expand-request` (parent counter-draft uuid). Step graph
 * (features/content-expansion.md §4): load draft → expand to blog/x/linkedin/email
 * via per-channel LLM calls → batch persist 4 rows у `content_variants` →
 * persist run row з ContentExpandRunStats. Aggregated output validated через
 * `ContentExpansionOutputSchema` (.length(4) + unique channels).
 */

type CounterDraftRow = {
  id: string;
  body: string;
  tone_pillar: string;
  channel_hint: string;
  reasoning: string;
  evidence_refs: string[];
  competitors: { display_name: string } | null;
};

function basePrompt(draft: CounterDraftRow): string {
  const brand = draft.competitors?.display_name ?? "the brand";
  return [
    `Brand: ${brand}`,
    `Tone pillar: ${draft.tone_pillar}`,
    `Original counter-draft body:`,
    draft.body,
    ``,
    `Reasoning behind the original draft:`,
    draft.reasoning,
  ].join("\n");
}

export const contentExpand = inngest.createFunction(
  { id: "content-expand", name: "W7 Multi-channel Content Expansion" },
  { event: "content.expand-request" },
  async ({ event, step }) => {
    const startedAt = new Date();
    const { organization_id, parent_counter_draft_id } = event.data;

    // 1. Load counter-draft + parent brand display name ------------------------
    const counterDraft = (await step.run("load-counter-draft", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("counter_drafts")
        .select(
          "id, body, tone_pillar, channel_hint, reasoning, evidence_refs, competitors:signal_id(competitor_id, competitors(display_name))",
        )
        .eq("id", parent_counter_draft_id)
        .eq("organization_id", organization_id)
        .single();
      if (error || !data) {
        throw new Error(
          `[load-counter-draft] ${error?.message ?? "row not found"} for ${parent_counter_draft_id}`,
        );
      }
      // Supabase relational select shape varies; flatten нащадка до competitors object.
      const raw = data as unknown as {
        id: string;
        body: string;
        tone_pillar: string;
        channel_hint: string;
        reasoning: string;
        evidence_refs: string[];
        competitors:
          | {
              competitors: { display_name: string } | null;
            }
          | null;
      };
      const flat: CounterDraftRow = {
        id: raw.id,
        body: raw.body,
        tone_pillar: raw.tone_pillar,
        channel_hint: raw.channel_hint,
        reasoning: raw.reasoning,
        evidence_refs: raw.evidence_refs,
        competitors: raw.competitors?.competitors ?? null,
      };
      return flat;
    })) as CounterDraftRow;

    const evidenceRefs = counterDraft.evidence_refs.length > 0
      ? counterDraft.evidence_refs
      : [counterDraft.id];

    // 2. Blog (Anthropic, longer-form) ----------------------------------------
    const blogVariant = (await step.run("expand-blog", async () => {
      const prompt = [
        basePrompt(counterDraft),
        ``,
        `TASK: Expand into a ~800 word blog post.`,
        `Schema: channel="blog", title (5-120 chars, headline), body ≥800 words, metadata`,
        `must include meta_description (≤160 chars) and slug_suggestion (kebab-case).`,
        `evidence_refs MUST equal: ${JSON.stringify(evidenceRefs)}.`,
      ].join("\n");
      const { object } = await generateObjectAnthropic({
        schema: ContentVariantSchema,
        prompt,
        model: "claude-sonnet-4-5",
        organization_id,
        operation: "expand-blog",
        schemaName: "BlogVariant",
        maxTokens: 2400,
        temperature: 0.5,
      });
      return ContentVariantSchema.parse({
        ...object,
        channel: "blog",
        evidence_refs: evidenceRefs,
      });
    })) as ContentVariant;

    // 3. X thread (gpt-4o-mini) ----------------------------------------------
    const xVariant = (await step.run("expand-x-thread", async () => {
      const prompt = [
        basePrompt(counterDraft),
        ``,
        `TASK: Adapt as a 5-tweet X thread.`,
        `Schema: channel="x_thread", title=null, body = the full thread joined with double newlines,`,
        `metadata.tweets MUST be an array of exactly 5 strings, each ≤280 chars.`,
        `evidence_refs MUST equal: ${JSON.stringify(evidenceRefs)}.`,
      ].join("\n");
      const { object } = await generateObjectOpenAI({
        schema: ContentVariantSchema,
        prompt,
        model: "gpt-4o-mini",
        organization_id,
        operation: "expand-x-thread",
        schemaName: "XThreadVariant",
        maxTokens: 1200,
        temperature: 0.6,
      });
      return ContentVariantSchema.parse({
        ...object,
        channel: "x_thread",
        title: null,
        evidence_refs: evidenceRefs,
      });
    })) as ContentVariant;

    // 4. LinkedIn (gpt-4o-mini) ----------------------------------------------
    const linkedinVariant = (await step.run("expand-linkedin", async () => {
      const prompt = [
        basePrompt(counterDraft),
        ``,
        `TASK: Write a ~200-word LinkedIn post.`,
        `Schema: channel="linkedin", title=null, body 50-1500 chars (~200 words),`,
        `metadata.hashtags = array of 3-5 brand-relevant hashtags (no leading #).`,
        `evidence_refs MUST equal: ${JSON.stringify(evidenceRefs)}.`,
      ].join("\n");
      const { object } = await generateObjectOpenAI({
        schema: ContentVariantSchema,
        prompt,
        model: "gpt-4o-mini",
        organization_id,
        operation: "expand-linkedin",
        schemaName: "LinkedInVariant",
        maxTokens: 900,
        temperature: 0.5,
      });
      return ContentVariantSchema.parse({
        ...object,
        channel: "linkedin",
        title: null,
        evidence_refs: evidenceRefs,
      });
    })) as ContentVariant;

    // 5. Email (gpt-4o-mini) -------------------------------------------------
    const emailVariant = (await step.run("expand-email", async () => {
      const prompt = [
        basePrompt(counterDraft),
        ``,
        `TASK: Format as outbound email.`,
        `Schema: channel="email", title=null, body = email body (~300 words), metadata must`,
        `include subject (≤80 chars) and preheader (≤120 chars).`,
        `evidence_refs MUST equal: ${JSON.stringify(evidenceRefs)}.`,
      ].join("\n");
      const { object } = await generateObjectOpenAI({
        schema: ContentVariantSchema,
        prompt,
        model: "gpt-4o-mini",
        organization_id,
        operation: "expand-email",
        schemaName: "EmailVariant",
        maxTokens: 900,
        temperature: 0.5,
      });
      return ContentVariantSchema.parse({
        ...object,
        channel: "email",
        title: null,
        evidence_refs: evidenceRefs,
      });
    })) as ContentVariant;

    const variants: ContentVariant[] = [
      blogVariant,
      xVariant,
      linkedinVariant,
      emailVariant,
    ];

    // Aggregate validation — guarantees .length(4) + unique channels.
    ContentExpansionOutputSchema.parse({
      parent_counter_draft_id,
      variants,
    });

    // 6. Persist all 4 variants in single insert ------------------------------
    await step.run("persist-variants", async () => {
      const supabase = createServiceClient();
      const rows = variants.map((v) => ({
        organization_id,
        parent_counter_draft_id,
        channel: v.channel,
        title: v.title,
        body: v.body,
        metadata: v.metadata as unknown as Json,
        evidence_refs: v.evidence_refs,
        status: "generated" as const,
      }));
      // UNIQUE (parent_counter_draft_id, channel) → on conflict do nothing
      // keeps step idempotent on retry.
      const { error } = await supabase
        .from("content_variants")
        .upsert(rows, {
          onConflict: "parent_counter_draft_id,channel",
          ignoreDuplicates: true,
        });
      if (error) {
        throw new Error(`[persist-variants] ${error.message}`);
      }
    });

    // 7. Persist run row -----------------------------------------------------
    const finishedAt = new Date();
    const runId = await step.run("persist-run", async () => {
      const supabase = createServiceClient();
      const baseStats = {
        function_name: "content-expand" as const,
        started_at: startedAt.toISOString(),
        duration_seconds: Math.max(
          0,
          Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000),
        ),
        parent_counter_draft_id,
        variants_generated: variants.length,
        cost_usd_cents: 0,
      };

      const { data: inserted, error: insErr } = await supabase
        .from("runs")
        .insert({
          organization_id,
          function_name: "content-expand",
          event_payload: event.data as unknown as Json,
          ok: true,
          started_at: startedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
          stats: ContentExpandRunStatsSchema.parse(baseStats) as unknown as Json,
        })
        .select("id")
        .single();
      if (insErr || !inserted) {
        throw new Error(
          `[persist-run] insert failed: ${insErr?.message ?? "no row"}`,
        );
      }
      const id = (inserted as { id: string }).id;

      const cost = await sumRunCost(id);
      const finalStats = ContentExpandRunStatsSchema.parse({
        ...baseStats,
        cost_usd_cents: cost,
      });
      const { error: updErr } = await supabase
        .from("runs")
        .update({ stats: finalStats as unknown as Json })
        .eq("id", id);
      if (updErr) {
        throw new Error(`[persist-run] cost update failed: ${updErr.message}`);
      }
      return id;
    });

    return {
      run_id: runId,
      variants_generated: variants.length,
      parent_counter_draft_id,
    };
  },
);
