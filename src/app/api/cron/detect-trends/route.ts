import { requireCron } from "@/lib/cron-auth";
import { computeInsights } from "@/lib/insights/compute";
import { setTrendSnapshot } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Trending-issue detector + client-watch: clusters the last few days of tickets
// into problem themes, computes the deterministic client/repeat/negative signals,
// and stores one snapshot the Insights page + inbox banner read. Bearer
// CRON_SECRET; scheduled hourly in vercel.json.
export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;

  try {
    const snapshot = await computeInsights();
    await setTrendSnapshot(snapshot);
    return Response.json({
      ok: true,
      ticketsAnalysed: snapshot.ticketsAnalysed,
      clusters: snapshot.clusters.length,
      clientsToWatch: snapshot.clientsToWatch.length,
      repeatContacts: snapshot.repeatContacts.length,
      negativeSpikes: snapshot.negativeSpikes.length,
    });
  } catch (error) {
    console.error("detect-trends failed:", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "failed" }, { status: 500 });
  }
}
