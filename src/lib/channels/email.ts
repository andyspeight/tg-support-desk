import "server-only";
import { db } from "@/lib/db/client";
import {
  addMessage,
  audit,
  createTicket,
  findTicketByThreadKey,
  getBlockedPatterns,
  setMessageAttachments,
  updateTicket,
} from "@/lib/db/queries";
import { notify, ticketRecipients } from "@/lib/db/notifications";
import type { Message, Ticket } from "@/lib/db/types";
import type { Json } from "@/lib/db/database.types";
import { env } from "@/lib/env";
import { firstNameFrom } from "@/lib/names";
import { matchesBlocklist, parseGmailMessage, type GmailMessage } from "./email-parse";
import { buildReplyMime, getAttachmentBytes, sendMessage } from "./gmail";
import { renderCustomerEmail, textToEmailHtml } from "./email-template";
import { storeAttachments, storeOutboundAttachments, type OutboundFile } from "./attachments";
import { replyOutbound, type ReplyDelivery } from "./reply-plan";

// Email channel: Gmail message → ticket/message rows, and ticket reply → email.

export type IngestResult = {
  ticket: Ticket;
  message: Message;
  createdTicket: boolean;
  /** Loop guard: auto-replies/bounces are stored but never AI-answered. */
  suppressAi: boolean;
};

export async function ingestGmailMessage(gmailMessage: GmailMessage): Promise<IngestResult | null> {
  const parsed = parseGmailMessage(gmailMessage);

  // Skip our own outbound mail and anything without a usable sender. "Us" is
  // SUPPORT_EMAIL plus any configured aliases (e.g. the underlying mailbox).
  const selfAddresses = new Set([env.supportEmail, ...env.supportEmailAliases]);
  if (!parsed.fromEmail || selfAddresses.has(parsed.fromEmail)) return null;

  // Spam control: drop blocklisted senders before a ticket is ever created.
  const blocked = await getBlockedPatterns();
  if (matchesBlocklist(parsed.fromEmail, blocked)) {
    await audit("system", "email-channel", "spam.blocked", undefined, { from: parsed.fromEmail });
    return null;
  }

  let ticket = await findTicketByThreadKey(gmailMessage.threadId);
  let createdTicket = false;

  if (!ticket) {
    const tags: string[] = [];
    // Sender verification failed → the ticket still exists, but the AI must
    // not act on it. Fail closed by escalating straight away.
    const unverified = parsed.senderVerified === "fail";
    if (unverified) tags.push("unverified-sender");
    if (parsed.isAutoReply) tags.push("auto-notification");

    ticket = await createTicket({
      requester_email: parsed.fromEmail,
      requester_name: parsed.fromName,
      channel: "email",
      subject: parsed.subject,
      email_thread_key: gmailMessage.threadId,
      cc_emails: parsed.cc.filter((e) => e !== env.supportEmail),
      tags,
      ...(unverified
        ? { status: "escalated" as const, escalation_reason: "sender_verification_failed" }
        : {}),
    });
    createdTicket = true;
    await audit("system", "email-channel", "ticket.created", { type: "ticket", id: ticket.id }, {
      channel: "email",
      sender_verified: parsed.senderVerified,
      auto_reply: parsed.isAutoReply,
    });
  } else if (!parsed.isAutoReply && (ticket.status === "resolved" || ticket.status === "closed")) {
    // Customer replied after resolution — reopen. (An OOO bouncing back off
    // our own resolution reply must NOT reopen the ticket.)
    ticket = await updateTicket(ticket.id, {
      status: "new",
      ai_resolved: false,
      resolved_at: null,
    });
    await audit("system", "email-channel", "ticket.reopened", { type: "ticket", id: ticket.id });
  }

  // Union any newly-seen CC recipients onto an existing ticket.
  if (!createdTicket && parsed.cc.length) {
    const merged = [...new Set([...ticket.cc_emails, ...parsed.cc])].filter((e) => e !== env.supportEmail);
    if (merged.length !== ticket.cc_emails.length) {
      ticket = await updateTicket(ticket.id, { cc_emails: merged });
    }
  }

  const message = await addMessage({
    ticket_id: ticket.id,
    role: "customer",
    author: parsed.fromEmail,
    body_text: parsed.text,
    body_html: parsed.html,
    attachments: parsed.attachments.map((a) => ({ ...a })),
    channel_meta: {
      gmail_message_id: gmailMessage.id,
      gmail_thread_id: gmailMessage.threadId,
      message_id: parsed.messageId,
      in_reply_to: parsed.inReplyTo,
      references: parsed.references,
      sender_verified: parsed.senderVerified,
      auto_reply: parsed.isAutoReply,
    },
  });

  // Fetch + store allowlisted attachments, then enrich the message metadata.
  // Best-effort: failures are recorded per-attachment, never block ingest.
  if (parsed.attachments.length > 0) {
    try {
      const stored = await storeAttachments(ticket.id, message.id, parsed.attachments, (attachmentId) =>
        getAttachmentBytes(gmailMessage.id, attachmentId),
      );
      await setMessageAttachments(message.id, stored as unknown as Json);
      message.attachments = stored as unknown as Json;
    } catch (error) {
      console.error("storeAttachments failed:", error);
    }
  }

  // Existing-ticket customer reply → ping the owner + watchers. (The AI runs
  // separately; this matters for human-owned / escalated tickets.)
  if (!createdTicket && !parsed.isAutoReply) {
    const recipients = ticketRecipients(ticket);
    if (recipients.length > 0) {
      await notify({
        recipients,
        type: "customer_reply",
        ticketId: ticket.id,
        title: `Customer replied on #${ticket.reference} — ${ticket.subject}`,
        actor: parsed.fromEmail,
      });
    }
  }

  // Instant receipt on a brand-new email ticket so the customer isn't left in
  // silence (especially while the AI is in shadow mode). Skipped for auto-replies
  // (loop/backscatter risk) and spoof-failed senders. Best-effort — a failed
  // receipt must never block ingest.
  if (createdTicket && !parsed.isAutoReply && parsed.senderVerified !== "fail") {
    await sendAutoAck(ticket);
  }

  return { ticket, message, createdTicket, suppressAi: parsed.isAutoReply };
}

/**
 * Auto-acknowledgement: a brief branded "we've got it, ticket #N" sent the
 * moment a new email ticket is created. Email channel only (web-form and portal
 * tickets already get an on-screen confirmation, and a web-form email is
 * unverified — we never send to it). Threads into the conversation, and captures
 * the Gmail thread id so the customer's reply to the receipt lands on the ticket.
 */
export async function sendAutoAck(ticket: Ticket): Promise<void> {
  if (replyOutbound(ticket.channel, env.gmailConfigured) !== "email") return;

  const name = firstNameFrom(ticket.requester_name);
  const greeting = name === "there" ? "Hello," : `Hi ${name},`;
  const text =
    `${greeting}\n\n` +
    `Thanks for getting in touch — we've received your message and opened ticket #${ticket.reference}. ` +
    `A member of the team will get back to you by email as soon as we can.\n\n` +
    `There's nothing you need to do in the meantime. If you'd like to add anything, just reply to this email.\n\n` +
    `— Travelgenix Support`;
  const html = renderCustomerEmail({
    bodyHtml: textToEmailHtml(text),
    reference: ticket.reference,
    helpUrl: env.appBaseUrl || undefined,
  });

  try {
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
    // Stored as plain text so the agent thread shows a tidy "System" line (not the
    // full email document). The branded HTML goes to the customer, not the store.
    await addMessage({
      ticket_id: ticket.id,
      role: "system",
      author: "auto-ack",
      body_text: text,
      channel_meta: { kind: "auto_ack", outbound: true, gmail_message_id: sent.id, gmail_thread_id: sent.threadId },
    });
    if (!ticket.email_thread_key && sent.threadId) {
      await updateTicket(ticket.id, { email_thread_key: sent.threadId });
    }
    await audit("system", "auto-ack", "message.auto_ack_sent", { type: "ticket", id: ticket.id });
  } catch (error) {
    console.error("sendAutoAck failed:", error);
  }
}

export async function latestCustomerThreadMeta(ticketId: string): Promise<{ messageId: string | null; references: string[] }> {
  const { data } = await db()
    .from("messages")
    .select("channel_meta")
    .eq("ticket_id", ticketId)
    .eq("role", "customer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const meta = (data?.channel_meta ?? {}) as { message_id?: string | null; references?: string[] };
  return { messageId: meta.message_id ?? null, references: meta.references ?? [] };
}

export async function sendTicketReply(
  ticket: Ticket,
  body: string,
  opts: { role: "ai" | "human"; author: string; html?: string; fromName?: string; attachments?: OutboundFile[] },
): Promise<{ message: Message; delivery: ReplyDelivery }> {
  const plan = replyOutbound(ticket.channel, env.gmailConfigured);

  // In-app channels (portal/widget) deliver in-app; an email ticket on an
  // un-wired mailbox is stored but not sent. Both paths persist the reply
  // WITHOUT touching the throwing Gmail env getters, so the reply flow can
  // never crash before go-live (or if the mailbox is ever unset).
  if (plan !== "email") {
    const message = await addMessage({
      ticket_id: ticket.id,
      role: opts.role,
      author: opts.author,
      body_text: body,
      body_html: opts.html ?? null,
      channel_meta: plan === "store" ? { outbound: true, delivery: "not_configured" } : { delivered: ticket.channel },
    });

    if (opts.attachments && opts.attachments.length > 0) {
      const stored = await storeOutboundAttachments(ticket.id, message.id, opts.attachments);
      await setMessageAttachments(message.id, stored as unknown as Json);
      message.attachments = stored as unknown as Json;
    }

    // Only a reply that genuinely reached the customer starts the first-response
    // clock; a stored-but-unsent one must not skew SLA/first-response metrics.
    if (plan === "inapp" && !ticket.first_response_at) {
      await updateTicket(ticket.id, { first_response_at: new Date().toISOString() });
    }

    await audit(
      opts.role === "ai" ? "ai" : "human",
      opts.author,
      plan === "store" ? "message.stored_undelivered" : "message.sent",
      { type: "ticket", id: ticket.id },
    );
    return { message, delivery: plan === "store" ? "stored" : "delivered" };
  }

  // Wired email: send for real. A transient send failure throws to the caller,
  // which surfaces it without losing the draft — no message row is written
  // here, so a retry cannot duplicate the reply.
  const { messageId, references } = await latestCustomerThreadMeta(ticket.id);
  const subject = /^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject}`;
  const refs = [...references, ...(messageId ? [messageId] : [])];

  // Frame the reply in the Travelgenix shell so the customer gets a branded
  // email, not a bare line. AI replies arrive as text (no html) — promote those
  // to HTML so they're styled too; the plain `body` stays as the text/plain part.
  const brandedHtml = renderCustomerEmail({
    bodyHtml: opts.html ?? textToEmailHtml(body),
    reference: ticket.reference,
    helpUrl: env.appBaseUrl || undefined,
  });

  const sent = await sendMessage(
    await buildReplyMime({
      to: ticket.requester_email,
      cc: ticket.cc_emails.filter((e) => e !== ticket.requester_email && e !== env.supportEmail),
      subject,
      text: body,
      html: brandedHtml,
      fromName: opts.fromName,
      attachments: opts.attachments,
      inReplyTo: messageId,
      references: refs,
    }),
    ticket.email_thread_key,
  );

  const message = await addMessage({
    ticket_id: ticket.id,
    role: opts.role,
    author: opts.author,
    body_text: body,
    body_html: opts.html ?? null,
    channel_meta: { gmail_message_id: sent.id, gmail_thread_id: sent.threadId, outbound: true },
  });

  if (opts.attachments && opts.attachments.length > 0) {
    const stored = await storeOutboundAttachments(ticket.id, message.id, opts.attachments);
    await setMessageAttachments(message.id, stored as unknown as Json);
    message.attachments = stored as unknown as Json;
  }

  if (!ticket.first_response_at) {
    await updateTicket(ticket.id, { first_response_at: new Date().toISOString() });
  }

  await audit(opts.role === "ai" ? "ai" : "human", opts.author, "message.sent", {
    type: "ticket",
    id: ticket.id,
  });

  return { message, delivery: "delivered" };
}
