import { env } from "@/lib/env";
import { requireCron } from "@/lib/cron-auth";
import { db } from "@/lib/db/client";
import { audit, awaitingResponse, getTicketsByIds, updateTicket } from "@/lib/db/queries";
import { hasRecentNotification, lastTypeNotificationAt, notify, ticketRecipients } from "@/lib/db/notifications";
import { sweepInactiveWaiting } from "@/lib/channels/inactivity";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Hourly sweep (Vercel cron). Five jobs:
//  1. Tickets awaiting an agent reply for > STALE_TICKET_HOURS → alert owner.
//  2. Snoozed tickets whose time is up → alert owner + clear the snooze.
//  3. "Waiting on customer" tickets gone quiet → reminder, then auto-close.
//  4. Held unknown senders older than the expiry → auto-close as spam (bound the queue).
//  5. Unknown senders still in the approval queue → nudge agents on new arrivals.
const STALE_HOURS = Number(process.env.STALE_TICKET_HOURS ?? "24");
// Don't re-nudge an agent about the approval queue more often than this…
const APPROVAL_NUDGE_HOURS = Number(process.env.PENDING_APPROVAL_NUDGE_HOURS ?? "6");
// …and auto-close held tickets nobody ever actioned after this many days, so an
// abandoned / attacker-refilled queue can't grow (or nag) without bound.
const HELD_EXPIRY_DAYS = Number(process.env.PENDING_APPROVAL_EXPIRY_DAYS ?? "14");

export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;
  try {
    // Expire stale held tickets first so the nudge reflects the drained queue.
    const expiredHeld = await sweepExpiredHeld();
    const [staleAlerts, snoozeAlerts, inactivity, approvalNudges] = await Promise.all([
      sweepStale(),
      sweepSnoozed(),
      sweepInactiveWaiting(),
      sweepPendingApproval(),
    ]);
    return Response.json({ staleAlerts, snoozeAlerts, inactivity, expiredHeld, approvalNudges });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("stale-tickets failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

async function sweepStale(): Promise<number> {
  const cutoff = Date.now() - STALE_HOURS * 3_600_000;
  const stale = (await awaitingResponse()).filter((a) => new Date(a.waitingSince).getTime() <= cutoff);
  if (stale.length === 0) return 0;

  const tickets = await getTicketsByIds(stale.map((s) => s.ticketId));
  let count = 0;
  for (const ticket of tickets) {
    const owners = ticketRecipients(ticket);
    const recipients = owners.length > 0 ? owners : env.agentEmails;
    for (const recipient of recipients) {
      // Don't re-alert the same person about the same ticket every hour.
      if (await hasRecentNotification(recipient, ticket.id, "stale", 20)) continue;
      await notify({
        recipients: [recipient],
        type: "stale",
        ticketId: ticket.id,
        title: `No reply in ${STALE_HOURS}h: #${ticket.reference} — ${ticket.subject}`,
        actor: "system",
      });
      count++;
    }
  }
  return count;
}

async function sweepSnoozed(): Promise<number> {
  const { data, error } = await db()
    .from("tickets")
    .select("id, reference, subject, assignee, watchers")
    .eq("tenant_id", env.tenantId)
    .not("snoozed_until", "is", null)
    .lte("snoozed_until", new Date().toISOString());
  if (error) {
    console.error("sweepSnoozed:", error.message);
    return 0;
  }

  let count = 0;
  for (const t of data ?? []) {
    for (const recipient of ticketRecipients(t)) {
      await notify({
        recipients: [recipient],
        type: "snooze_due",
        ticketId: t.id,
        title: `Snooze ended: #${t.reference} — ${t.subject}`,
        actor: "system",
      });
      count++;
    }
    await updateTicket(t.id, { snoozed_until: null });
  }
  return count;
}

// Held unknown senders generate no per-ticket alert (deliberately quiet, so spam
// stays quiet). Instead, nudge agents about the queue — but only on NEW activity:
// a nudge fires when a held ticket has arrived since the recipient's last nudge,
// rate-limited to once per APPROVAL_NUDGE_HOURS. So a genuinely-new client gets a
// prompt nudge, while a static/abandoned (or attacker-refilled) queue stops
// nagging once everything in it has already been flagged.
async function sweepPendingApproval(): Promise<number> {
  // One query gives both the total (for the message) and the newest arrival.
  const { data, count, error } = await db()
    .from("tickets")
    .select("created_at", { count: "exact" })
    .eq("tenant_id", env.tenantId)
    .eq("status", "awaiting_approval")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("sweepPendingApproval:", error.message);
    return 0;
  }
  const newest = data?.[0]?.created_at;
  const pending = count ?? 0;
  if (!newest || pending === 0) return 0;
  const newestMs = new Date(newest).getTime();

  const recipients = env.agentEmails.length > 0 ? env.agentEmails : env.ownerEmails;
  let nudged = 0;
  for (const recipient of recipients) {
    try {
      const lastAt = await lastTypeNotificationAt(recipient, "pending_approval");
      if (lastAt) {
        const lastMs = new Date(lastAt).getTime();
        if (Date.now() - lastMs < APPROVAL_NUDGE_HOURS * 3_600_000) continue; // rate floor
        if (newestMs <= lastMs) continue; // nothing new since their last nudge
      }
      await notify({
        recipients: [recipient],
        type: "pending_approval",
        ticketId: null,
        title: `${pending} sender${pending === 1 ? "" : "s"} awaiting approval — review the Pending approval queue`,
        actor: "system",
      });
      nudged++;
    } catch (e) {
      // Fail safe: a lookup error skips this recipient rather than risk spamming.
      console.error("sweepPendingApproval recipient skipped:", e);
    }
  }
  return nudged;
}

// Auto-close held tickets nobody ever approved or blocked within the expiry
// window. They're closed and tagged spam (an unverified, unvouched-for unknown
// sender left this long is treated as abandoned/spam) — which also keeps them out
// of analytics. Bounds the approval queue so it can't grow or nag indefinitely.
async function sweepExpiredHeld(): Promise<number> {
  const cutoff = new Date(Date.now() - HELD_EXPIRY_DAYS * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("tickets")
    .select("id, tags")
    .eq("tenant_id", env.tenantId)
    .eq("status", "awaiting_approval")
    .lte("created_at", cutoff)
    .limit(200);
  if (error) {
    console.error("sweepExpiredHeld:", error.message);
    return 0;
  }
  let closed = 0;
  for (const t of data ?? []) {
    const tags = [...new Set([...(t.tags ?? []).filter((x) => x !== "unknown-sender"), "spam", "auto-expired"])];
    await updateTicket(t.id, { status: "closed", tags });
    await audit("system", "approval-sweep", "sender.auto_expired", { type: "ticket", id: t.id }, { days: HELD_EXPIRY_DAYS });
    closed++;
  }
  return closed;
}
