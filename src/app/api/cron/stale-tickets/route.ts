import { env } from "@/lib/env";
import { requireCron } from "@/lib/cron-auth";
import { db } from "@/lib/db/client";
import { awaitingResponse, getTicketsByIds, updateTicket } from "@/lib/db/queries";
import { hasRecentNotification, notify, ticketRecipients } from "@/lib/db/notifications";
import { sweepInactiveWaiting } from "@/lib/channels/inactivity";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Hourly sweep (Vercel cron). Three jobs:
//  1. Tickets awaiting an agent reply for > STALE_TICKET_HOURS → alert owner.
//  2. Snoozed tickets whose time is up → alert owner + clear the snooze.
//  3. "Waiting on customer" tickets gone quiet → reminder, then auto-close.
const STALE_HOURS = Number(process.env.STALE_TICKET_HOURS ?? "24");

export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;
  try {
    const [staleAlerts, snoozeAlerts, inactivity] = await Promise.all([
      sweepStale(),
      sweepSnoozed(),
      sweepInactiveWaiting(),
    ]);
    return Response.json({ staleAlerts, snoozeAlerts, inactivity });
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
