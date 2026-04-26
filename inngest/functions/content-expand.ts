import "server-only";

import { z } from "zod";

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
 * (features/content-expansion.md §4): load draft → expand to blog/x/linkedin
 * via per-channel LLM calls → batch persist 3 rows у `content_variants` →
 * persist run row з ContentExpandRunStats. Aggregated output validated через
 * `ContentExpansionOutputSchema` (.length(3) + unique channels). Email channel
 * deprecated 2026-04-25 — поза demo scope.
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

    // 0. Create run row рано — щоб усі subsequent LLM calls тегували cost_ledger
    //    rows з run_id. finalize-run наприкінці UPDATE'ить ok/finished/stats.
    const runId = (await step.run("create-run", async () => {
      const supabase = createServiceClient() as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>) => {
            select: (cols: string) => {
              single: () => Promise<{
                data: { id: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
      const placeholderStats = ContentExpandRunStatsSchema.parse({
        function_name: "content-expand" as const,
        started_at: startedAt.toISOString(),
        duration_seconds: 0,
        parent_counter_draft_id,
        variants_generated: 0,
        cost_usd_cents: 0,
      });
      // ok=false placeholder (DB NOT NULL). finalize-run UPDATE'ить на true.
      const { data, error } = await supabase
        .from("runs")
        .insert({
          organization_id,
          function_name: "content-expand",
          event_payload: event.data as unknown as Record<string, unknown>,
          ok: false,
          started_at: startedAt.toISOString(),
          finished_at: null,
          stats: placeholderStats as unknown as Record<string, unknown>,
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`[create-run] insert failed: ${error?.message ?? "no row"}`);
      }
      return data.id;
    })) as string;

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

    // Per-channel narrow schemas — submitted to LLM structured output. Тримаємо
    // metadata fields як top-level required щоб LLM (особливо OpenAI) реально
    // повертав їх. Потім reshape'имо у канонічний ContentVariantSchema у parent
    // scope. lib/schemas/content-variant.ts CRITICAL zone — не змінюємо.
    const BlogLLMSchema = z.object({
      title: z.string().min(5).max(120),
      body: z.string().min(50),
      meta_description: z.string().min(1).max(160),
      slug_suggestion: z.string().min(1),
    });
    const XThreadLLMSchema = z.object({
      body: z.string().min(50),
      tweets: z.array(z.string().min(1).max(280)).min(3).max(8),
    });
    const LinkedInLLMSchema = z.object({
      body: z.string().min(50).max(1500),
      hashtags: z.array(z.string().min(1)).min(2).max(8),
    });

    // 2. Blog (Anthropic, longer-form) ----------------------------------------
    const blogVariant = (await step.run("expand-blog", async () => {
      const prompt = [
        basePrompt(counterDraft),
        ``,
        `TASK: Expand into a ~800 word blog post.`,
        `Output: title (5-120 chars headline), body ≥800 words, meta_description ≤160 chars,`,
        `slug_suggestion in kebab-case.`,
      ].join("\n");
      const { object } = await generateObjectAnthropic({
        schema: BlogLLMSchema,
        prompt,
        model: "claude-haiku-4-5-20251001",
        organization_id,
        operation: "expand-blog",
        schemaName: "BlogVariant",
        maxTokens: 2400,
        temperature: 0.5,
        run_id: runId,
      });
      return ContentVariantSchema.parse({
        channel: "blog",
        title: object.title,
        body: object.body,
        metadata: {
          meta_description: object.meta_description,
          slug_suggestion: object.slug_suggestion,
        },
        evidence_refs: evidenceRefs,
      });
    })) as ContentVariant;

    // 3. X thread (gpt-4o-mini) ----------------------------------------------
    const xVariant = (await step.run("expand-x-thread", async () => {
      const prompt = [
        basePrompt(counterDraft),
        ``,
        `TASK: Adapt as a 3-7 tweet X thread.`,
        `Output: body = full thread joined with double newlines, tweets = array of 3-7 strings`,
        `each ≤280 chars composing a thread in logical order.`,
      ].join("\n");
      const { object } = await generateObjectOpenAI({
        schema: XThreadLLMSchema,
        prompt,
        model: "gpt-4o-mini",
        organization_id,
        operation: "expand-x-thread",
        schemaName: "XThreadVariant",
        maxTokens: 1200,
        temperature: 0.6,
        run_id: runId,
      });
      return ContentVariantSchema.parse({
        channel: "x_thread",
        title: null,
        body: object.body,
        metadata: { tweets: object.tweets },
        evidence_refs: evidenceRefs,
      });
    })) as ContentVariant;

    // 4. LinkedIn (gpt-4o-mini) ----------------------------------------------
    const linkedinVariant = (await step.run("expand-linkedin", async () => {
      const prompt = [
        basePrompt(counterDraft),
        ``,
        `TASK: Write a ~200-word LinkedIn post.`,
        `Output: body 50-1500 chars (~200 words), hashtags = 2-8 brand-relevant tags`,
        `(no leading #).`,
      ].join("\n");
      const { object } = await generateObjectOpenAI({
        schema: LinkedInLLMSchema,
        prompt,
        model: "gpt-4o-mini",
        organization_id,
        operation: "expand-linkedin",
        schemaName: "LinkedInVariant",
        maxTokens: 900,
        temperature: 0.5,
        run_id: runId,
      });
      return ContentVariantSchema.parse({
        channel: "linkedin",
        title: null,
        body: object.body,
        metadata: { hashtags: object.hashtags },
        evidence_refs: evidenceRefs,
      });
    })) as ContentVariant;

    const variants: ContentVariant[] = [
      blogVariant,
      xVariant,
      linkedinVariant,
    ];

    // Aggregate validation — guarantees .length(3) + unique channels.
    ContentExpansionOutputSchema.parse({
      parent_counter_draft_id,
      variants,
    });

    // 6. Persist all 3 variants in single insert ------------------------------
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

    // 7. Finalize run row ----------------------------------------------------
    // Run row already exists (created on step 0). Sum cost з cost_ledger
    // (rows tagged з runId) → UPDATE row з final stats + ok + finished.
    const finishedAt = new Date();
    await step.run("finalize-run", async () => {
      const supabase = createServiceClient();
      const cost = await sumRunCost(runId);
      const finalStats = ContentExpandRunStatsSchema.parse({
        function_name: "content-expand" as const,
        started_at: startedAt.toISOString(),
        duration_seconds: Math.max(
          0,
          Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000),
        ),
        parent_counter_draft_id,
        variants_generated: variants.length,
        cost_usd_cents: cost,
      });
      const { error: updErr } = await supabase
        .from("runs")
        .update({
          ok: true,
          finished_at: finishedAt.toISOString(),
          stats: finalStats as unknown as Json,
        })
        .eq("id", runId);
      if (updErr) {
        throw new Error(`[finalize-run] update failed: ${updErr.message}`);
      }
    });

    return {
      run_id: runId,
      variants_generated: variants.length,
      parent_counter_draft_id,
    };
  },
);
