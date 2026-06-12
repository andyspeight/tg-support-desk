"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { addMessage, audit, getTicket, updateTicket } from "@/lib/db/queries";
import { sendTicketReply } from "@/lib/channels/email";
import { resolveTicket } from "@/lib/ai/resolve";

const replySchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1).max(20000),
});

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
  const { ticketId, body } = replySchema.parse(Object.fromEntries(formData));
  const ticket = await getTicket(ticketId);
  if (!ticket) throw new Error("Ticket not found");

  await sendTicketReply(ticket, body, { role: "human", author: session.email });
  await updateTicket(ticketId, { status: "waiting_on_customer" });
  refresh(ticketId);
}

export async function addNoteAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { ticketId, body } = replySchema.parse(Object.fromEntries(formData));

  await addMessage({ ticket_id: ticketId, role: "internal_note", author: session.email, body_text: body });
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
