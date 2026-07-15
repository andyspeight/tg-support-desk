import { env } from "@/lib/env";
import { requireCron } from "@/lib/cron-auth";
import { getWeeklyGapDigest } from "@/lib/db/analytics";
import { sendEmail } from "@/lib/channels/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Weekly gap digest (brief §8): the improvement-loop email to Andy/agents —
// AI resolution rate + trend, top escalation reasons, intents the AI is
// struggling with, and KB candidates waiting for review. Dormant until Gmail
// is configured. Bearer CRON_SECRET; scheduled weekly in vercel.json.
export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;
  if (!env.gmailConfigured) return Response.json({ skipped: "gmail not configured" });

  const recipients = env.agentEmails;
  if (recipients.length === 0) return Response.json({ skipped: "no agents configured" });

  const d = await getWeeklyGapDigest();
  if (!d) return Response.json({ skipped: "no data" });

  const base = env.appBaseUrl.replace(/\/$/, "");
  const trend =
    d.thisWeek.aiRatePct !== null && d.lastWeekAiRatePct !== null
      ? ` (${d.thisWeek.aiRatePct >= d.lastWeekAiRatePct ? "▲" : "▼"} from ${d.lastWeekAiRatePct}% last week)`
      : "";

  const text = [
    "TG Support — weekly gap digest",
    "",
    `True AI resolution rate: ${d.thisWeek.aiRatePct ?? "—"}%${trend}`,
    `This week: ${d.thisWeek.created} tickets in · ${d.thisWeek.resolved} resolved · ${d.thisWeek.aiResolved} by AI`,
    "",
    "Top escalation reasons:",
    ...(d.topEscalationReasons.length ? d.topEscalationReasons.map((r) => `  • ${r.reason} — ${r.count}`) : ["  • none this week"]),
    "",
    "Intents the AI is struggling with:",
    ...(d.failingIntents.length
      ? d.failingIntents.map((i) => `  • ${i.intent} — ${i.aiRate}% AI of ${i.total} resolved`)
      : ["  • none flagged"]),
    "",
    "Published articles to revise (used but not landing):",
    ...(d.articlesToReview.length
      ? d.articlesToReview.map((a) => `  • ${a.title} — ${a.resolveRate ?? 0}% resolved of ${a.cited} cited`)
      : ["  • none"]),
    "",
    `KB candidates awaiting review: ${d.kbReview.count}`,
    ...d.kbReview.titles.map((t) => `  • ${t}`),
    "",
    ...(base ? [`Review queue → ${base}/staff/kb`, `Full analytics → ${base}/staff/analytics`] : []),
  ].join("\n");

  let sent = 0;
  for (const to of recipients) {
    try {
      await sendEmail({ to, subject: "[TG Support] Weekly gap digest", text });
      sent++;
    } catch (err) {
      console.error(`weekly-digest to ${to}:`, err);
    }
  }
  return Response.json({ sent, recipients: recipients.length, aiRatePct: d.thisWeek.aiRatePct });
}
