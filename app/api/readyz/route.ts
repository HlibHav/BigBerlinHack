import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error" | "skipped"> = {
    supabase: "skipped",
    inngest: "skipped",
  };
  const errors: Record<string, string> = {};

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey) {
    try {
      const sb = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
      });
      const { error } = await sb.from("organizations").select("id").limit(1);
      checks.supabase = error ? "error" : "ok";
      if (error) errors.supabase = error.message;
    } catch (err) {
      checks.supabase = "error";
      errors.supabase = err instanceof Error ? err.message : "unknown";
    }
  }

  const inngestEventKey = process.env.INNGEST_EVENT_KEY;
  const inngestDev = process.env.INNGEST_DEV;
  if (inngestEventKey || inngestDev) {
    checks.inngest = "ok";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    {
      ready: allOk,
      checks,
      ...(Object.keys(errors).length > 0 && { errors }),
    },
    { status: allOk ? 200 : 503 }
  );
}
