import "server-only";

import type { MorningBrief } from "@/lib/schemas/morning-brief";

export interface SendSlackInput {
  webhook_url: string;
  blocks?: unknown[];
  text_fallback: string;
}

/**
 * POST to a Slack incoming webhook with a single 1-second backoff on 429.
 * Slack expects either `text` or `blocks` (or both); we always send
 * `text` as fallback for notifications/clients that don't render Block Kit.
 */
export async function sendSlack(input: SendSlackInput): Promise<void> {
  const body = JSON.stringify({
    text: input.text_fallback,
    blocks: input.blocks,
  });

  const post = () =>
    fetch(input.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

  let res = await post();
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await post();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[slack] webhook HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
}

export interface FormatBriefBlocksInput {
  summary_body: MorningBrief["summary_body"];
  severity_breakdown: MorningBrief["severity_breakdown"];
  drafts_pending: MorningBrief["drafts_pending"];
  brand_pulse: MorningBrief["brand_pulse"];
}

/**
 * Convert a `MorningBriefSchema` payload into Slack Block Kit. Layout:
 * header → severity context → main markdown body → optional brand-pulse
 * fields → "drafts pending" footer. Returns an array suitable for the
 * `blocks` field of the webhook body.
 */
export function formatBriefBlocks(input: FormatBriefBlocksInput): unknown[] {
  const { summary_body, severity_breakdown, drafts_pending, brand_pulse } = input;

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "BBH morning brief", emoji: false },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*Signals:* ${severity_breakdown.high} high · ${severity_breakdown.med} med · ${severity_breakdown.low} low`,
        },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: truncateForSlack(summary_body, 2900) },
    },
  ];

  if (brand_pulse) {
    const fields: Array<{ type: "mrkdwn"; text: string }> = [];
    if (brand_pulse.visibility_pct !== null) {
      fields.push({
        type: "mrkdwn",
        text: `*Visibility*\n${formatPct(brand_pulse.visibility_pct)}`,
      });
    }
    if (brand_pulse.avg_position !== null) {
      fields.push({
        type: "mrkdwn",
        text: `*Avg position*\n${brand_pulse.avg_position.toFixed(1)}`,
      });
    }
    if (brand_pulse.sentiment_mix) {
      const m = brand_pulse.sentiment_mix;
      fields.push({
        type: "mrkdwn",
        text: `*Sentiment*\n+${m.positive_pct.toFixed(0)} / ~${m.neutral_pct.toFixed(0)} / -${m.negative_pct.toFixed(0)}`,
      });
    }
    if (fields.length > 0) {
      blocks.push({ type: "section", fields });
    }
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text:
          drafts_pending > 0
            ? `:memo: ${drafts_pending} draft${drafts_pending === 1 ? "" : "s"} pending review`
            : ":white_check_mark: No drafts pending",
      },
    ],
  });

  return blocks;
}

// --- helpers ---------------------------------------------------------------

function truncateForSlack(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function formatPct(value: number): string {
  // brand_pulse.visibility_pct may arrive as either 0..1 or 0..100. Normalize
  // to a percent string without making assumptions outside obvious ranges.
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}
