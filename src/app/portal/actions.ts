"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { askKb, type AskResult } from "@/lib/ai/copilot";
import {
  addMessage,
  audit,
  createTicket,
  getRequesterTicket,
  recentActionCount,
  setMessageAttachments,
  updateTicket,
} from "@/lib/db/queries";
import { resolveTicket } from "@/lib/ai/resolve";
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

/** Instant self-serve answer — no ticket created. Rate-limited per client. */
export async function askAction(question: string): Promise<AskResult> {
  const session = await requireClient();
  if ((await recentActionCount(session.email, "portal.ask", 60)) >= 20) {
    return {
      answer: "You’ve asked a lot in a short time — give it a moment, or raise a ticket and we’ll help.",
      sources: [],
    };
  }
  await audit("human", session.email, "portal.ask");
  return askKb(String(question ?? ""));
}

const raiseSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(8000),
});

export async function raiseTicketAction(formData: FormData): Promise<void> {
  const session = await requireClient();
  const { subject, body } = raiseSchema.parse({
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  const files = await filesFrom(formData);

  const ticket = await createTicket({
    requester_email: session.email,
    requester_name: session.name,
    channel: "portal",
    subject,
    status: "new",
  });
  const message = await addMessage({ ticket_id: ticket.id, role: "customer", author: session.email, body_text: body });
  await attachTo(ticket.id, message.id, files);
  await audit("human", session.email, "ticket.created", { type: "ticket", id: ticket.id }, { channel: "portal" });

  // Fire the AI immediately. Respects shadow mode (drafts for a human) and
  // fail-safe-escalates internally, so we never block the client on it.
  try {
    await resolveTicket(ticket.id, { trigger: "manual", actor: session.email });
  } catch {
    // handled inside resolveTicket
  }
  redirect(`/portal/ticket/${ticket.id}`);
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
  const owned = await getRequesterTicket(ticketId, session.email); // ownership check
  if (!owned) throw new Error("Ticket not found");
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
  revalidatePath(`/portal/ticket/${ticketId}`);
}

const rateSchema = z.object({ ticketId: z.string().uuid(), score: z.coerce.number() });

export async function rateAction(formData: FormData): Promise<void> {
  const session = await requireClient();
  const { ticketId, score } = rateSchema.parse({
    ticketId: formData.get("ticketId"),
    score: formData.get("score"),
  });
  if (!isValidScore(score)) return;
  const owned = await getRequesterTicket(ticketId, session.email); // ownership check
  if (!owned) throw new Error("Ticket not found");

  await updateTicket(ticketId, { csat_score: score });
  await audit("human", session.email, "csat.rated", { type: "ticket", id: ticketId }, { score });
  revalidatePath(`/portal/ticket/${ticketId}`);
}
