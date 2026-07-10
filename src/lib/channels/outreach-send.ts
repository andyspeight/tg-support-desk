import "server-only";
import type { Json } from "@/lib/db/database.types";
import { audit, createTicket, getNextSendingOutreach, updateOutreachIncident } from "@/lib/db/queries";
import { sendTicketReply } from "./email";
import { personaliseOutreach, supplierSlug } from "@/lib/outreach";
import type { OutreachRecipient } from "@/lib/db/types";

// Sequential Gmail sends self-pace to roughly the API's rate limit, so a run of
// this size stays comfortably under a minute (no overlap with the next cron tick)
// and well within the daily send quota. ~300 clients drain over a few runs.
const BATCH = 50;

export type OutreachSendOpts = { slug: string; subject: string; author: string; message: string };

/**
 * Send one outreach email as its own ticket (so a client's reply threads back
 * into the desk and the normal flow picks it up). Shared by the inline small-send
 * path and the background drainer. Throws on failure so the caller can record it.
 */
export async function sendOutreachToRecipient(opts: OutreachSendOpts, recipient: OutreachRecipient): Promise<void> {
  const ticket = await createTicket({
    requester_email: recipient.email,
    requester_name: recipient.name ?? null,
    subject: opts.subject,
    channel: "email",
    status: "waiting_on_customer",
    priority: "p3",
    tags: ["proactive", `supplier:${opts.slug}`],
  });
  await sendTicketReply(ticket, personaliseOutreach(opts.message, recipient.name), {
    role: "human",
    author: opts.author,
    subject: opts.subject,
  });
}

/**
 * Drain one 'sending' incident by a batch. Tracks attempted recipients in
 * done_emails (persisted after each send) so a run is resumable across cron ticks
 * and an overlap can never double-send. Marks the incident 'sent' once every
 * recipient has been attempted.
 */
export async function drainOutreach(): Promise<{ processed: number; incidentId?: string; complete?: boolean }> {
  const incident = await getNextSendingOutreach();
  if (!incident) return { processed: 0 };

  const recipients = (Array.isArray(incident.recipients) ? incident.recipients : []) as OutreachRecipient[];
  const done = new Set(
    ((Array.isArray(incident.done_emails) ? incident.done_emails : []) as string[]).map((e) => e.toLowerCase()),
  );
  const batch = recipients.filter((r) => !done.has(r.email.toLowerCase())).slice(0, BATCH);

  const opts: OutreachSendOpts = {
    slug: supplierSlug(incident.supplier),
    subject: incident.summary.slice(0, 150),
    author: incident.created_by ?? "proactive-outreach",
    message: incident.draft_message ?? "",
  };

  let sent = incident.sent_count;
  for (const recipient of batch) {
    try {
      await sendOutreachToRecipient(opts, recipient);
      sent += 1;
    } catch (error) {
      console.error(`outreach send to ${recipient.email} failed:`, error);
    }
    done.add(recipient.email.toLowerCase());
    await updateOutreachIncident(incident.id, { done_emails: [...done] as unknown as Json, sent_count: sent });
  }

  const complete = recipients.every((r) => done.has(r.email.toLowerCase()));
  if (complete) {
    await updateOutreachIncident(incident.id, { status: "sent", sent_at: new Date().toISOString() });
  }
  await audit("system", "outreach-sender", "outreach.batch_sent", { type: "outreach", id: incident.id }, {
    batch: batch.length,
    sent,
    total: recipients.length,
    complete,
  });
  return { processed: batch.length, incidentId: incident.id, complete };
}
