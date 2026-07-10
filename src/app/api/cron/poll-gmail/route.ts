import { pollGmailInboxRepeating } from "@/lib/channels/poll-inbox";
import { env } from "@/lib/env";
import { requireCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` automatically when
// the CRON_SECRET env var is set. Fail closed on anything else.
export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;
  if (!env.gmailConfigured) return Response.json({ skipped: "gmail not configured" });

  try {
    const summary = await pollGmailInboxRepeating();
    if (summary.errors.length) console.error("poll-gmail errors:", summary.errors);
    return Response.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("poll-gmail failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
