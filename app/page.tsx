import Link from "next/link";

export default function HomePage() {
  const demoSlug = process.env.DEMO_BRAND_SLUG ?? "bbh";
  return (
    <main className="container max-w-3xl py-16 space-y-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          BBH · Brand Intelligence Agent · Powered by Peec MCP
        </p>
        <h1 className="text-4xl font-semibold leading-tight">
          Peec sees the brand pulse.{" "}
          <span className="text-muted-foreground">BBH closes the loop.</span>
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Competitor radar (SLA 2h). Positioning simulator. Multi-channel
          counter-narratives on approve. Daily Slack brief. All powered by
          Peec MCP data + own intelligence layer.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/demo/${demoSlug}`}
          className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
        >
          Open demo dashboard →
        </Link>
      </div>

      <div className="border-t pt-6 text-sm text-muted-foreground space-y-2">
        <p>
          Demo brand: <code className="font-mono">{demoSlug}</code> (self-promo —
          BBH monitors itself vs Profound, BrandRank.ai, Mention).
        </p>
        <p>
          Stack: Next.js 14 · Supabase · Inngest · <strong>Peec MCP</strong> ·
          Tavily · OpenAI/Anthropic · Slack webhook.
        </p>
      </div>
    </main>
  );
}
