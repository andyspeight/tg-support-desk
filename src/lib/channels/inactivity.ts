import "server-only";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { addMessage, audit, updateTicket } from "@/lib/db/queries";
import { firstNameFrom } from "@/lib/names";
import { decideInactivityAction } from "@/lib/inactivity-policy";
import type { Ticket } from "@/lib/db/types";
import { buildReplyMime, sendMessage } from "./gmail";
import { renderCustomerEmail, textToEmailHtml } from "./email-template";
import { latestCustomerThreadMeta } from "./email";

// "Client not responding" handling. Hourly (from the stale-tickets cron): for
// email tickets sitting in waiting_on_customer, after a few business days of
// silence send one reminder, then a few days later auto-close (a reply reopens
// it via the inbound channel). Email channel only — web-form/portal tickets are
// out of scope. Templated system emails, so this runs regardless of shadow mode.

export type InactivitySummary = { reminded: number; closed: number; skipped?: string };

type MsgRow = { ticket_id: string; role: string; created_at: string; channel_meta: unknown };

function isKind(meta: unknown, kind: string): boolean {
  return !!meta && typeof meta === "object" && (meta as { kind?: string }).kind === kind;
}

export async function sweepInactiveWaiting(nowMs = Date.now()): Promise<InactivitySummary> {
  if (!env.inactivityChase) return { reminded: 0, closed: 0, skipped: "disabled" };
  if (!env.gmailConfigured) return { reminded: 0, closed: 0, skipped: "gmail not configured" };

  const { data: tickets, error } = await db()
    .from("tickets")
    .select("*")
    .eq("tenant_id", env.tenantId)
    .eq("status", "waiting_on_customer")
    .eq("channel", "email")
    .limit(500);
  if (error) throw new Error(`sweepInactiveWaiting tickets: ${error.message}`);
  if (!tickets || tickets.length === 0) return { reminded: 0, closed: 0 };

  const ids = tickets.map((t) => t.id);
  const { data: msgs, error: mErr } = await db()
    .from("messages")
    .select("ticket_id, role, created_at, channel_meta")
    .in("ticket_id", ids)
    .order("created_at", { ascending: true });
  if (mErr) throw new Error(`sweepInactiveWaiting messages: ${mErr.message}`);

  const byTicket = new Map<string, MsgRow[]>();
  for (const m of (msgs ?? []) as MsgRow[]) {
    const arr = byTicket.get(m.ticket_id) ?? [];
    arr.push(m);
    byTicket.set(m.ticket_id, arr);
  }

  let reminded = 0;
  let closed = 0;
  for (const ticket of tickets as Ticket[]) {
    const rows = byTicket.get(ticket.id) ?? [];
    if (rows.length === 0) continue;
    const lastCustomer = [...rows].reverse().find((r) => r.role === "customer");
    if (!lastCustomer) continue; // nothing to measure silence against
    const lastCustomerMs = new Date(lastCustomer.created_at).getTime();
    const reminder = rows.find(
      (r) => isKind(r.channel_meta, "inactivity_reminder") && new Date(r.created_at).getTime() > lastCustomerMs,
    );

    const decision = decideInactivityAction({
      lastCustomerMs,
      lastMessageFromCustomer: rows[rows.length - 1]?.role === "customer",
      reminderMs: reminder ? new Date(reminder.created_at).getTime() : null,
      nowMs,
      remindDays: env.inactivityRemindDays,
      closeDays: env.inactivityCloseDays,
    });

    try {
      if (decision === "remind") {
        await remindInactive(ticket);
        reminded++;
      } else if (decision === "close") {
        await closeForInactivity(ticket);
        closed++;
      }
    } catch (err) {
      // One ticket failing (e.g. a transient send error) must not stop the sweep.
      console.error(`inactivity ${decision} failed for ${ticket.id}:`, err);
    }
  }
  return { reminded, closed };
}

async function sendThreaded(ticket: Ticket, text: string, kind: string): Promise<void> {
  const html = renderCustomerEmail({
    bodyHtml: textToEmailHtml(text),
    reference: ticket.reference,
    helpUrl: env.appBaseUrl || undefined,
  });
  const { messageId, references } = await latestCustomerThreadMeta(ticket.id);
  const subject = /^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject}`;
  const sent = await sendMessage(
    await buildReplyMime({
      to: ticket.requester_email,
      subject,
      text,
      html,
      inReplyTo: messageId,
      references: [...references, ...(messageId ? [messageId] : [])],
    }),
    ticket.email_thread_key,
  );
  await addMessage({
    ticket_id: ticket.id,
    role: "system",
    author: "inactivity",
    body_text: text,
    channel_meta: { kind, outbound: true, gmail_message_id: sent.id, gmail_thread_id: sent.threadId },
  });
}

function greet(ticket: Ticket): string {
  const name = firstNameFrom(ticket.requester_name);
  return name === "there" ? "Hello," : `Hi ${name},`;
}

async function remindInactive(ticket: Ticket): Promise<void> {
  const text =
    `${greet(ticket)}\n\n` +
    `Just checking in on your request (#${ticket.reference} — ${ticket.subject}). We asked for a little more information to look into it but haven't heard back yet, and wanted to make sure our message didn't get missed.\n\n` +
    `Whenever you're ready, just reply to this email with the details and we'll pick it straight back up. If we don't hear from you we'll close this off in a few days — but you can always reply to reopen it.\n\n` +
    `— Travelgenix Support`;
  await sendThreaded(ticket, text, "inactivity_reminder");
  await audit("system", "inactivity", "ticket.inactivity_reminder", { type: "ticket", id: ticket.id });
}

async function closeForInactivity(ticket: Ticket): Promise<void> {
  const text =
    `${greet(ticket)}\n\n` +
    `We haven't heard back on your request (#${ticket.reference} — ${ticket.subject}), so we've closed it for now to keep things tidy.\n\n` +
    `There's nothing you need to do — but if you still need a hand, just reply to this email and it'll reopen straight away.\n\n` +
    `— Travelgenix Support`;
  await sendThreaded(ticket, text, "inactivity_close");
  const tags = Array.isArray(ticket.tags) ? ticket.tags : [];
  await updateTicket(ticket.id, {
    status: "closed",
    ...(tags.includes("auto-closed") ? {} : { tags: [...tags, "auto-closed"] }),
  });
  await audit("system", "inactivity", "ticket.auto_closed", { type: "ticket", id: ticket.id }, { reason: "no_customer_response" });
}
