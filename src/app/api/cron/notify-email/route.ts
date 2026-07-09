import { env } from "@/lib/env";
import { requireCron } from "@/lib/cron-auth";
import { listUnemailedNotifications, markEmailed } from "@/lib/db/notifications";
import { sendEmail } from "@/lib/channels/gmail";
import type { Notification } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Email mirror of in-app notifications: one digest email per recipient covering
// their new, still-unread alerts. Dormant (no-op) until Gmail is configured.
const TYPE_LABEL: Record<string, string> = {
  assigned: "Assigned to you",
  customer_reply: "Customer reply",
  escalated: "Escalated",
  mention: "You were mentioned",
  stale: "Awaiting your reply",
  snooze_due: "Snooze ended",
  pending_approval: "Senders awaiting approval",
  needs_review: "AI reply ready to send",
};

export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;
  if (!env.gmailConfigured) return Response.json({ skipped: "gmail not configured" });

  try {
    const items = await listUnemailedNotifications(12);
    if (items.length === 0) return Response.json({ emailed: 0, recipients: 0 });

    const byRecipient = new Map<string, Notification[]>();
    for (const n of items) {
      const list = byRecipient.get(n.recipient) ?? [];
      list.push(n);
      byRecipient.set(n.recipient, list);
    }

    const base = env.appBaseUrl.replace(/\/$/, "");
    let emailed = 0;
    for (const [recipient, list] of byRecipient) {
      const lines = list.map((n) => `• ${TYPE_LABEL[n.type] ?? n.type}: ${n.title}${n.body ? `\n  ${n.body}` : ""}`);
      const text = [
        `You have ${list.length} new support desk notification${list.length === 1 ? "" : "s"}:`,
        "",
        ...lines,
        "",
        base ? `Open the desk: ${base}/notifications` : "Open the desk to action these.",
      ].join("\n");
      try {
        await sendEmail({
          to: recipient,
          subject: list.length === 1 ? `[TG Support] ${list[0].title}` : `[TG Support] ${list.length} new notifications`,
          text,
        });
        await markEmailed(list.map((n) => n.id));
        emailed += list.length;
      } catch (err) {
        // Leave un-emailed so the next run retries this recipient.
        console.error(`notify-email to ${recipient}:`, err);
      }
    }
    return Response.json({ emailed, recipients: byRecipient.size });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("notify-email failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
