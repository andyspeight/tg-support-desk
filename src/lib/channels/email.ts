import "server-only";
import { db } from "@/lib/db/client";
import {
  addMessage,
  audit,
  createTicket,
  findTicketByThreadKey,
  getAllowedPatterns,
  getBlockedPatterns,
  isReturningRequester,
  setMessageAttachments,
  updateTicket,
} from "@/lib/db/queries";
import { matchClientByEmail } from "@/lib/integrations/airtable-clients";
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
  // Held = unknown-sender ticket parked for human approval; the AI stays out
  // and no auto-ack goes out until an agent approves the sender.
  let held = false;

  // Known-sender check (an Airtable lookup), memoised — used by both the Spam
  // rescue below and the unknown-sender gate on new tickets.
  const senderEmail = parsed.fromEmail; // narrowed to string by the guard above
  let knownSender: boolean | undefined;
  const isKnown = async (): Promise<boolean> => {
    if (knownSender === undefined) knownSender = await isKnownSender(senderEmail);
    return knownSender;
  };

  // The poll also reads the Spam folder, because Gmail mis-files real client
  // mail there and it would otherwise be lost. But we only rescue what we can
  // trust — a known sender, or a reply on an existing thread. A genuinely-new
  // message Gmail flagged as spam is left where Gmail put it.
  if ((gmailMessage.labelIds ?? []).includes("SPAM") && !ticket && !(await isKnown())) {
    await audit("system", "email-channel", "spam.folder_ignored", undefined, { from: parsed.fromEmail });
    return null;
  }

  if (!ticket) {
    const tags: string[] = [];
    // Sender verification failed → the ticket still exists, but the AI must
    // not act on it. Fail closed by escalating straight away.
    const unverified = parsed.senderVerified === "fail";
    if (unverified) tags.push("unverified-sender");
    if (parsed.isAutoReply) tags.push("auto-notification");

    // Spam gate: a first-time sender who is neither allow-listed nor a known
    // Airtable client is parked in the approval queue. Skipped for spoof-failed
    // senders (already escalated above) and machine auto-notifications (no human
    // to approve — the existing auto-reply suppression handles those).
    if (!unverified && !parsed.isAutoReply && !(await isKnown())) {
      held = true;
      tags.push("unknown-sender");
    }

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
        : held
          ? { status: "awaiting_approval" as const }
          : {}),
    });
    createdTicket = true;
    await audit("system", "email-channel", "ticket.created", { type: "ticket", id: ticket.id }, {
      channel: "email",
      sender_verified: parsed.senderVerified,
      auto_reply: parsed.isAutoReply,
      held_for_approval: held,
    });
  } else if (ticket.status === "awaiting_approval") {
    // A held sender wrote again before approval — keep it parked, don't reopen.
    held = true;
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

  // A brand-new ticket held for sender approval can't be touched by the AI until
  // a human vets the sender — so alert the team straight away rather than leaving
  // it for the hourly approval sweep. This is a "human needed" trigger.
  if (createdTicket && held) {
    await notify({
      recipients: env.agentEmails,
      type: "pending_approval",
      ticketId: ticket.id,
      title: `Approve new sender ${parsed.fromEmail} — #${ticket.reference}`,
      body: parsed.subject,
      actor: parsed.fromEmail,
    });
  }

  // Instant receipt on a brand-new email ticket so the customer isn't left in
  // silence (especially while the AI is in shadow mode). Skipped for auto-replies
  // (loop/backscatter risk) and spoof-failed senders. Best-effort — a failed
  // receipt must never block ingest.
  if (createdTicket && !parsed.isAutoReply && parsed.senderVerified !== "fail" && !held) {
    await sendAutoAck(ticket);
  }

  return { ticket, message, createdTicket, suppressAi: parsed.isAutoReply || held };
}

/**
 * Is this sender trusted enough to skip the approval queue? True when the
 * address (or its domain) is on the allow-list, or when it ties to a live
 * Airtable client record. The allow-list is checked first: it's the cheaper
 * lookup and keeps working even if Airtable is unreachable. Any failure fails
 * closed (treated as unknown → held), which is the safe default for a spam gate.
 */
export async function isKnownSender(email: string): Promise<boolean> {
  try {
    const allowed = await getAllowedPatterns();
    if (matchesBlocklist(email, allowed)) return true;
    return (await matchClientByEmail(email)) !== null;
  } catch (error) {
    console.error("isKnownSender failed, holding for approval:", error);
    return false;
  }
}

/**
 * Auto-acknowledgement: a brief branded "we've got it, ticket #N" sent the
 * moment a ticket is created, on any channel that resolves to email delivery
 * (email + portal once the mailbox is wired). Skipped when the reply plan isn't
 * "email" (e.g. Gmail not configured — portal still shows an on-screen receipt).
 * Threads into the conversation and captures the Gmail thread id, so the
 * customer's reply to the receipt lands back on this ticket.
 */
export async function sendAutoAck(ticket: Ticket, opts: { verifiedRecipient?: boolean } = {}): Promise<void> {
  if (replyOutbound(ticket.channel, env.gmailConfigured) !== "email") return;

  // Greet a returning contact by name and acknowledge we know them, rather than
  // the flat first-time hello. Best-effort — a lookup failure just falls back.
  const returning = await isReturningRequester(ticket.requester_email, ticket.created_at).catch(() => false);
  const name = firstNameFrom(ticket.requester_name);
  const greeting = name === "there" ? (returning ? "Hello again," : "Hello,") : returning ? `Welcome back, ${name},` : `Hi ${name},`;
  const opener = returning
    ? `Good to hear from you again — we've received your message and opened ticket #${ticket.reference}. `
    : `Thanks for getting in touch — we've received your message and opened ticket #${ticket.reference}. `;
  const text =
    `${greeting}\n\n` +
    opener +
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
    // An anonymous portal submitter's email is unverified — never reflect their
    // attacker-controllable subject into an outbound from the trusted mailbox
    // (that would let it send "Re: <anything>" to any address). Use a neutral,
    // fixed subject for those; verified recipients keep the threaded subject.
    const subject =
      opts.verifiedRecipient === false
        ? `We've received your support request — ticket #${ticket.reference}`
        : /^re:/i.test(ticket.subject)
          ? ticket.subject
          : `Re: ${ticket.subject}`;
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
  opts: { role: "ai" | "human"; author: string; html?: string; fromName?: string; attachments?: OutboundFile[]; subject?: string },
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
  // A reply threads under "Re: …"; a first-contact send (e.g. proactive outreach)
  // passes its own subject so it doesn't look like a reply to nothing.
  const subject = opts.subject ?? (/^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject}`);
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

  // Capture the Gmail thread on first send (portal/web-form tickets have none
  // yet) so the customer's email reply threads back to THIS ticket instead of
  // opening a new one. Fold in the first-response stamp to keep it one write.
  const patch: Parameters<typeof updateTicket>[1] = {};
  if (!ticket.first_response_at) patch.first_response_at = new Date().toISOString();
  if (!ticket.email_thread_key && sent.threadId) patch.email_thread_key = sent.threadId;
  if (Object.keys(patch).length > 0) await updateTicket(ticket.id, patch);

  await audit(opts.role === "ai" ? "ai" : "human", opts.author, "message.sent", {
    type: "ticket",
    id: ticket.id,
  });

  return { message, delivery: "delivered" };
}
