import { pollGmailInbox } from "@/lib/channels/poll-inbox";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` automatically when
// the CRON_SECRET env var is set. Fail closed on anything else.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const summary = await pollGmailInbox();
    if (summary.errors.length) console.error("poll-gmail errors:", summary.errors);
    return Response.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("poll-gmail failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
