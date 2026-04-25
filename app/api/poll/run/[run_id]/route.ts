import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polling endpoint for client-side run status checks.
 * Used by RunRadarButton/SimulateButton/SendBriefButton (5s interval).
 *
 * Returns { ok, finished_at, stats } once run completes; else { ok: null, finished_at: null }.
 */
export async function GET(
  _req: Request,
  { params }: { params: { run_id: string } }
) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("runs")
    .select("ok, reason, stats, finished_at")
    .eq("id", params.run_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: null, finished_at: null });
  }

  return NextResponse.json({
    ok: data.ok,
    reason: data.reason,
    stats: data.stats,
    finished_at: data.finished_at,
  });
}
