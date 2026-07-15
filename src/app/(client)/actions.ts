"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getSession, requireClient, type Session } from "@/lib/auth";
import { askKb, assistTicketDraft, type AskResult, type DraftAssist } from "@/lib/ai/copilot";
import {
  addMessage,
  audit,
  createTicket,
  getPortalTicket,
  getRequesterTicket,
  recentActionCount,
  setMessageAttachments,
  updateTicket,
} from "@/lib/db/queries";
import { companyForEmail } from "@/lib/portal-company";
import { resolveTicket } from "@/lib/ai/resolve";
import { sendAutoAck } from "@/lib/channels/email";
import { isValidScore } from "@/lib/csat";
import { storeOutboundAttachments, type OutboundFile } from "@/lib/channels/attachments";
import type { Json } from "@/lib/db/database.types";

/** Read up to 5 uploaded files (screenshots etc.) off a portal form. */
async function filesFrom(formData: FormData): Promise<OutboundFile[]> {
  const raw = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const out: OutboundFile[] = [];
  for (const f of raw.slice(0, 5)) {
    const content = Buffer.from(await f.arrayBuffer());
    out.push({ filename: f.name, mimeType: f.type || "application/octet-stream", size: content.length, content });
  }
  return out;
}

async function attachTo(ticketId: string, messageId: string, files: OutboundFile[]): Promise<void> {
  if (files.length === 0) return;
  const stored = await storeOutboundAttachments(ticketId, messageId, files);
  await setMessageAttachments(messageId, stored as unknown as Json);
}

/** Rate-limit / audit key for a portal actor. Signed-in clients are keyed by
 *  email; anonymous public visitors by client IP (best-effort, from the proxy
 *  forwarded-for header) so one abuser can't burn through everyone's allowance
 *  while a shared office NAT stays workable. The key we rate-limit on MUST equal
 *  the key we audit under — recentActionCount reads the audit log by actor. */
async function actorFor(session: Session | null): Promise<string> {
  if (session) return session.email;
  const fwd = (await headers()).get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]!.trim() || "unknown";
  return `ip:${ip}`;
}

/** Instant self-serve answer — no ticket created. Public: the help centre is
 *  open to all, so this works signed-in or anonymously. Rate-limited per actor. */
export async function askAction(question: string): Promise<AskResult> {
  const actor = await actorFor(await getSession());
  if ((await recentActionCount(actor, "portal.ask", 60)) >= 20) {
    return {
      answer: "You’ve asked a lot in a short time — give it a moment, or raise a ticket and we’ll help.",
      sources: [],
    };
  }
  await audit("human", actor, "portal.ask");
  return askKb(String(question ?? ""));
}

const assistSchema = z.object({
  subject: z.string().max(200).optional(),
  message: z.string().max(8000).optional(),
});

/** Advisory pre-submit help for the portal's raise-a-ticket flow: a KB article
 *  that might already solve it + any missing detail. Rate-limited per client,
 *  never blocks a submission, fails open. */
export async function assistDraftAction(input: unknown): Promise<DraftAssist> {
  const actor = await actorFor(await getSession());
  const parsed = assistSchema.safeParse(input);
  if (!parsed.success) return { suggestions: [], article: null };
  const subject = (parsed.data.subject ?? "").trim();
  const message = (parsed.data.message ?? "").trim();
  if (message.length < 15) return { suggestions: [], article: null };
  if ((await recentActionCount(actor, "portal.assist", 60)) >= 20) {
    return { suggestions: [], article: null };
  }
  await audit("human", actor, "portal.assist");
  try {
    return await assistTicketDraft(subject, message);
  } catch {
    return { suggestions: [], article: null };
  }
}

const raiseSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(8000),
});

// Anonymous submitters (no SSO session) identify themselves on the form. Signed-in
// clients never see these fields — their identity comes from the session.
const anonSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
});

export async function raiseTicketAction(formData: FormData): Promise<void> {
  const session = await getSession();
  const { subject, body } = raiseSchema.parse({
    subject: formData.get("subject"),
    body: formData.get("body"),
  });

  // Identity: from the session when signed in, from the form when anonymous.
  // Store the email lowercased so a later sign-in with the same address lines up
  // with these tickets (listRequesterTickets matches on a lowercased email).
  let who: { email: string; name: string };
  if (session) {
    who = { email: session.email, name: session.name };
  } else {
    const a = anonSchema.parse({ name: formData.get("name"), email: formData.get("email") });
    who = { email: a.email.toLowerCase(), name: a.name };
  }

  // Ticket creation fires the AI loop — rate-limit it (brief §10). Keyed per
  // actor (email when signed in, IP when anonymous) to match the audit row.
  const actor = await actorFor(session);
  if ((await recentActionCount(actor, "ticket.created", 300)) >= 8) {
    throw new Error("You’ve raised several tickets in a row — please wait a moment before raising another.");
  }
  const files = await filesFrom(formData);

  const ticket = await createTicket({
    requester_email: who.email,
    requester_name: who.name,
    channel: "portal",
    subject,
    status: "new",
  });
  const message = await addMessage({ ticket_id: ticket.id, role: "customer", author: who.email, body_text: body });
  await attachTo(ticket.id, message.id, files);
  await audit("human", actor, "ticket.created", { type: "ticket", id: ticket.id }, { channel: "portal", email: who.email });

  // Email the client an acknowledgement (best-effort) so they get a receipt by
  // email, not just on screen — and so the Gmail thread is captured up front,
  // letting their email reply thread straight back to this ticket. For anonymous
  // submitters this is also how they follow up — replies come back in by email.
  await sendAutoAck(ticket);

  // Fire the AI immediately. Respects shadow mode (drafts for a human) and
  // fail-safe-escalates internally, so we never block the client on it.
  try {
    await resolveTicket(ticket.id, { trigger: "manual", actor: who.email });
  } catch {
    // handled inside resolveTicket
  }

  // Signed-in clients drop straight into the live ticket thread. Anonymous
  // submitters can't be authenticated to view a specific ticket, so land them on
  // a confirmation instead (they continue the conversation by email).
  if (session) redirect(`/tickets/${ticket.id}`);
  redirect(`/?submitted=${encodeURIComponent(String(ticket.reference))}`);
}

const replySchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1).max(8000),
});

export async function replyAction(formData: FormData): Promise<void> {
  const session = await requireClient();
  const { ticketId, body } = replySchema.parse({
    ticketId: formData.get("ticketId"),
    body: formData.get("body"),
  });
  // Access check: their own ticket, or a colleague's at the same client company
  // (resolved server-side — never trusted from the form).
  const company = await companyForEmail(session.email);
  const owned = await getPortalTicket(ticketId, session.email, company?.id ?? null);
  if (!owned) throw new Error("Ticket not found");
  // Replies re-run the AI loop too — same rate-limit posture (brief §10).
  if ((await recentActionCount(session.email, "ticket.customer_reply", 60)) >= 20) {
    throw new Error("You’re replying very quickly — give it a moment and try again.");
  }
  const files = await filesFrom(formData);

  const message = await addMessage({ ticket_id: ticketId, role: "customer", author: session.email, body_text: body });
  await attachTo(ticketId, message.id, files);
  if (owned.ticket.status === "resolved" || owned.ticket.status === "closed") {
    await updateTicket(ticketId, { status: "new", ai_resolved: false, resolved_at: null });
  }
  await audit("human", session.email, "ticket.customer_reply", { type: "ticket", id: ticketId });

  try {
    await resolveTicket(ticketId, { trigger: "manual", actor: session.email });
  } catch {
    // handled inside resolveTicket
  }
  revalidatePath(`/tickets/${ticketId}`);
}

const rateSchema = z.object({ ticketId: z.string().uuid(), score: z.coerce.number() });

export async function rateAction(formData: FormData): Promise<void> {
  const session = await requireClient();
  const { ticketId, score } = rateSchema.parse({
    ticketId: formData.get("ticketId"),
    score: formData.get("score"),
  });
  if (!isValidScore(score)) return;
  // Deliberately requester-only (not company-wide): the rating scores the
  // experience of whoever raised the ticket.
  const owned = await getRequesterTicket(ticketId, session.email); // ownership check
  if (!owned) throw new Error("Ticket not found");
  // CSAT only applies once a ticket is resolved/closed (mirrors recordCsat).
  if (owned.ticket.status !== "resolved" && owned.ticket.status !== "closed") return;

  await updateTicket(ticketId, { csat_score: score });
  await audit("human", session.email, "csat.rated", { type: "ticket", id: ticketId }, { score });
  revalidatePath(`/tickets/${ticketId}`);
}
