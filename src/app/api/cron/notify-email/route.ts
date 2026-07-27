import { env } from "@/lib/env";
import { requireCron } from "@/lib/cron-auth";
import { listUnemailedNotifications, markEmailed } from "@/lib/db/notifications";
import { getTicket } from "@/lib/db/queries";
import { listClientCompaniesCached } from "@/lib/integrations/airtable-clients";
import { sendEmail } from "@/lib/channels/gmail";
import { renderNotificationDigest, type NotifyEmailItem, type NotifyTicket } from "@/lib/notify-email";
import type { Notification, Ticket } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Email mirror of in-app notifications: one digest email per recipient covering
// their new, still-unread alerts — each with a direct link to its ticket and the
// ticket's key details. Dormant (no-op) until Gmail is configured.
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
    const all = await listUnemailedNotifications(12);
    // Never email our own support mailbox — its inbox is polled into tickets, so
    // a digest sent there opens a ticket, which raises another notification, and
    // loops. Retire any such rows so they can't sit in the queue retrying.
    const self = new Set(env.selfEmailAddresses);
    const selfAddressed = all.filter((n) => self.has(n.recipient.trim().toLowerCase()));
    if (selfAddressed.length > 0) await markEmailed(selfAddressed.map((n) => n.id));
    const items = all.filter((n) => !self.has(n.recipient.trim().toLowerCase()));
    if (items.length === 0) return Response.json({ emailed: 0, recipients: 0, skippedSelf: selfAddressed.length });

    const base = env.appBaseUrl.replace(/\/$/, "");
    const notificationsUrl = base ? `${base}/staff/notifications` : "";

    // Resolve each notification's ticket once (deduped), plus a client_id→company
    // map from one cached Airtable read — so the digest can show the details.
    const ticketIds = [...new Set(items.map((n) => n.ticket_id).filter((id): id is string => Boolean(id)))];
    const [ticketList, companies] = await Promise.all([
      Promise.all(ticketIds.map((id) => getTicket(id).catch(() => null))),
      listClientCompaniesCached().catch(() => []),
    ]);
    const ticketById = new Map<string, Ticket>();
    for (const t of ticketList) if (t) ticketById.set(t.id, t);
    const companyByClientId = new Map(companies.map((c) => [c.id, c.name] as const));

    const toNotifyTicket = (t: Ticket): NotifyTicket => ({
      reference: t.reference,
      subject: t.subject,
      requesterName: t.requester_name,
      requesterEmail: t.requester_email,
      company: (t.client_id && companyByClientId.get(t.client_id)) || null,
      status: t.status,
      priority: t.priority,
      url: base ? `${base}/staff/ticket/${t.id}` : "",
    });

    const byRecipient = new Map<string, Notification[]>();
    for (const n of items) {
      const list = byRecipient.get(n.recipient) ?? [];
      list.push(n);
      byRecipient.set(n.recipient, list);
    }

    let emailed = 0;
    for (const [recipient, list] of byRecipient) {
      const emailItems: NotifyEmailItem[] = list.map((n) => {
        const ticket = n.ticket_id ? ticketById.get(n.ticket_id) : undefined;
        return {
          label: TYPE_LABEL[n.type] ?? n.type,
          title: n.title,
          body: n.body,
          ticket: ticket ? toNotifyTicket(ticket) : null,
        };
      });
      const { text, html } = renderNotificationDigest(emailItems, { notificationsUrl });
      try {
        await sendEmail({
          to: recipient,
          subject: list.length === 1 ? `[TG Support] ${list[0].title}` : `[TG Support] ${list.length} new notifications`,
          text,
          html,
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
