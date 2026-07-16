import { requireCron } from "@/lib/cron-auth";
import { runCrmSync } from "@/lib/integrations/crm-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Hourly CRM write-back: refresh support summaries on CRM Companies and log
// resolved/escalated tickets to their activity timeline. No-op unless the CRM
// write token is configured. Bearer CRON_SECRET; scheduled in vercel.json.
export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;
  try {
    const result = await runCrmSync();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("crm-sync failed:", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "failed" }, { status: 500 });
  }
}
