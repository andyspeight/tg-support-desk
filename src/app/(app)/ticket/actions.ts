"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { addMessage, audit, getTicket, getTicketByReference, mergeTickets, setMessageAttachments, updateTicket } from "@/lib/db/queries";
import { sendTicketReply } from "@/lib/channels/email";
import { sanitizeEmailHtml, htmlToText } from "@/lib/channels/email-parse";
import { storeOutboundAttachments, type OutboundFile } from "@/lib/channels/attachments";
import type { Json } from "@/lib/db/database.types";
import { resolveTicket } from "@/lib/ai/resolve";

/** Parse the rich composer: sanitised HTML, derived plain text, uploaded files. */
async function composerInput(
  formData: FormData,
): Promise<{ ticketId: string; html: string; text: string; files: OutboundFile[] }> {
  const ticketId = z.string().uuid().parse(formData.get("ticketId"));
  const html = sanitizeEmailHtml(String(formData.get("html") ?? "")).slice(0, 100000);
  const text = htmlToText(html);
  const raw = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const files: OutboundFile[] = [];
  for (const f of raw.slice(0, 10)) {
    const content = Buffer.from(await f.arrayBuffer());
    files.push({ filename: f.name, mimeType: f.type || "application/octet-stream", size: content.length, content });
  }
  return { ticketId, html, text, files };
}

const updateSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(["new", "ai_working", "waiting_on_customer", "escalated", "resolved", "closed"]).optional(),
  priority: z.enum(["p1", "p2", "p3"]).optional(),
  assignee: z.string().optional(),
  tags: z.string().optional(),
});

function refresh(ticketId: string) {
  revalidatePath(`/ticket/${ticketId}`);
  revalidatePath("/inbox");
}

export async function sendReplyAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { ticketId, html, text, files } = await composerInput(formData);
  if (!text.trim() && files.length === 0) return;
  const ticket = await getTicket(ticketId);
  if (!ticket) throw new Error("Ticket not found");

  await sendTicketReply(ticket, text, {
    role: "human",
    author: session.email,
    html: html || undefined,
    attachments: files,
  });
  await updateTicket(ticketId, { status: "waiting_on_customer" });
  refresh(ticketId);
}

export async function addNoteAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { ticketId, html, text, files } = await composerInput(formData);
  if (!text.trim() && files.length === 0) return;

  const message = await addMessage({
    ticket_id: ticketId,
    role: "internal_note",
    author: session.email,
    body_text: text,
    body_html: html || null,
  });
  if (files.length > 0) {
    const stored = await storeOutboundAttachments(ticketId, message.id, files);
    await setMessageAttachments(message.id, stored as unknown as Json);
  }
  await audit("human", session.email, "note.added", { type: "ticket", id: ticketId });
  refresh(ticketId);
}

export async function updateTicketAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const input = updateSchema.parse(Object.fromEntries(formData));
  const ticket = await getTicket(input.ticketId);
  if (!ticket) throw new Error("Ticket not found");

  const patch: Parameters<typeof updateTicket>[1] = {};
  if (input.status && input.status !== ticket.status) {
    patch.status = input.status;
    if ((input.status === "resolved" || input.status === "closed") && !ticket.resolved_at) {
      patch.resolved_at = new Date().toISOString();
      patch.ai_resolved = false; // human-resolved
    }
    if (input.status === "new" || input.status === "escalated") {
      patch.resolved_at = null;
      patch.ai_resolved = false;
    }
  }
  if (input.priority) patch.priority = input.priority;
  if (input.assignee !== undefined) patch.assignee = input.assignee || null;
  if (input.tags !== undefined) {
    patch.tags = input.tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }

  if (Object.keys(patch).length > 0) {
    await updateTicket(input.ticketId, patch);
    await audit("human", session.email, "ticket.updated", { type: "ticket", id: input.ticketId }, patch);
  }
  refresh(input.ticketId);
}

const mergeSchema = z.object({
  ticketId: z.string().uuid(),
  targetRef: z.coerce.number().int().positive(),
});

export async function mergeTicketAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { ticketId, targetRef } = mergeSchema.parse(Object.fromEntries(formData));

  const target = await getTicketByReference(targetRef);
  if (!target) throw new Error(`No ticket #${targetRef} found`);
  if (target.id === ticketId) throw new Error("Cannot merge a ticket into itself");

  await mergeTickets(ticketId, target.id, session.email);
  revalidatePath("/inbox");
  redirect(`/ticket/${target.id}`);
}

export async function runAiAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const ticketId = z.string().uuid().parse(formData.get("ticketId"));

  await audit("human", session.email, "ai.manual_trigger", { type: "ticket", id: ticketId });
  try {
    await resolveTicket(ticketId, { trigger: "manual", actor: session.email });
  } catch {
    // resolveTicket fail-safe-escalates internally; surface state via refresh.
  }
  refresh(ticketId);
}
