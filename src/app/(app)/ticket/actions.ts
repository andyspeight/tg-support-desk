"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { addMessage, audit, getTicket, getTicketByReference, heartbeatPresence, mergeTickets, setMessageAttachments, unmergeTickets, updateTicket, type Viewer } from "@/lib/db/queries";
import { notify } from "@/lib/db/notifications";
import { parseMentions } from "@/lib/mentions";
import { env } from "@/lib/env";
import { sendTicketReply } from "@/lib/channels/email";
import { sanitizeEmailHtml, htmlToText } from "@/lib/channels/email-parse";
import { storeOutboundAttachments, type OutboundFile } from "@/lib/channels/attachments";
import type { Json } from "@/lib/db/database.types";
import { resolveTicket } from "@/lib/ai/resolve";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
  status: z.enum(["new", "ai_working", "waiting_on_customer", "escalated", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["p1", "p2", "p3"]).optional(),
  assignee: z.string().optional(),
  tags: z.string().optional(),
});

function refresh(ticketId: string) {
  revalidatePath(`/ticket/${ticketId}`);
  revalidatePath("/inbox");
}

/** Result surfaced to the composer so a failed/undeliverable reply shows an
 *  inline message instead of crashing the request (and keeps the agent's draft). */
export type ComposerResult = { ok: true; note?: string } | { ok: false; error: string };

export async function sendReplyAction(formData: FormData): Promise<ComposerResult> {
  const session = await requireAgent();
  const { ticketId, html, text, files } = await composerInput(formData);
  if (!text.trim() && files.length === 0) return { ok: false, error: "Nothing to send." };

  try {
    const ticket = await getTicket(ticketId);
    if (!ticket) return { ok: false, error: "Ticket not found." };

    // Sign the reply with the responding agent — their name on the email From
    // line and a warm sign-off in the body — instead of the generic team name.
    // Falls back to the team name when SSO hasn't given us a real display name.
    const agentName = session.name && !session.name.includes("@") ? session.name.trim() : null;
    const firstName = agentName?.split(/\s+/)[0] ?? null;
    const signedText = firstName ? `${text}\n\nBest wishes,\n${firstName}` : text;
    const signedHtml = html ? (firstName ? `${html}<p>Best wishes,<br>${escapeHtml(firstName)}</p>` : html) : "";

    const { delivery } = await sendTicketReply(ticket, signedText, {
      role: "human",
      author: session.email,
      html: signedHtml || undefined,
      fromName: agentName ?? undefined,
      attachments: files,
    });
    // Zendesk-style "submit as": the composer says what state to leave the
    // ticket in. Default keeps the old behaviour (waiting on the customer).
    const afterRaw = String(formData.get("afterStatus") ?? "");
    const after: "waiting_on_customer" | "resolved" | "closed" | "pending" =
      afterRaw === "resolved" || afterRaw === "closed" || afterRaw === "pending" ? afterRaw : "waiting_on_customer";
    const statusPatch: Parameters<typeof updateTicket>[1] = { status: after };
    if (after === "resolved" || after === "closed") {
      if (!ticket.resolved_at) statusPatch.resolved_at = new Date().toISOString();
      statusPatch.ai_resolved = false; // human-resolved
    }
    await updateTicket(ticketId, statusPatch);
    refresh(ticketId);

    return delivery === "stored"
      ? {
          ok: true,
          note: "Saved to the ticket. The support mailbox isn’t connected yet, so this wasn’t emailed to the customer.",
        }
      : { ok: true };
  } catch (error) {
    console.error("sendReplyAction failed:", error);
    return {
      ok: false,
      error: "We couldn’t send that reply — it hasn’t reached the customer. Your message is still here; please try again.",
    };
  }
}

export async function addNoteAction(formData: FormData): Promise<ComposerResult> {
  const session = await requireAgent();
  const { ticketId, html, text, files } = await composerInput(formData);
  if (!text.trim() && files.length === 0) return { ok: false, error: "Nothing to add." };

  try {
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

    // @mention in an internal note pings the colleague (without reassigning).
    const mentioned = parseMentions(text, env.agentEmails);
    if (mentioned.length > 0) {
      const t = await getTicket(ticketId);
      await notify({
        recipients: mentioned,
        skip: session.email,
        type: "mention",
        ticketId,
        title: t ? `${session.email} mentioned you on #${t.reference}` : `${session.email} mentioned you`,
        body: text.slice(0, 200),
        actor: session.email,
      });
    }
    refresh(ticketId);
    return { ok: true };
  } catch (error) {
    console.error("addNoteAction failed:", error);
    return { ok: false, error: "We couldn’t save that note — please try again." };
  }
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

  // Alert the new owner when a ticket is handed to someone else.
  if (input.assignee !== undefined) {
    const newAssignee = input.assignee || null;
    if (newAssignee && newAssignee !== ticket.assignee) {
      await notify({
        recipients: [newAssignee],
        skip: session.email,
        type: "assigned",
        ticketId: ticket.id,
        title: `You were assigned #${ticket.reference} — ${ticket.subject}`,
        actor: session.email,
      });
    }
  }
  refresh(input.ticketId);
}

const snoozeSchema = z.object({
  ticketId: z.string().uuid(),
  until: z.enum(["1h", "3h", "tomorrow", "3d", "clear"]),
});

function snoozeUntil(until: "1h" | "3h" | "tomorrow" | "3d"): string {
  const now = Date.now();
  if (until === "1h") return new Date(now + 3_600_000).toISOString();
  if (until === "3h") return new Date(now + 3 * 3_600_000).toISOString();
  if (until === "3d") return new Date(now + 3 * 86_400_000).toISOString();
  const t = new Date(now); // "tomorrow" ≈ next day, 08:00 UTC
  t.setUTCDate(t.getUTCDate() + 1);
  t.setUTCHours(8, 0, 0, 0);
  return t.toISOString();
}

/** Snooze a ticket out of the active queues until a time, or clear the snooze. */
export async function snoozeTicketAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { ticketId, until } = snoozeSchema.parse(Object.fromEntries(formData));
  await updateTicket(ticketId, { snoozed_until: until === "clear" ? null : snoozeUntil(until) });
  await audit("human", session.email, until === "clear" ? "ticket.unsnoozed" : "ticket.snoozed", { type: "ticket", id: ticketId }, { until });
  refresh(ticketId);
}

/** Toggle the current agent as a watcher (gets the ticket's alerts without owning it). */
export async function watchTicketAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const ticketId = z.string().uuid().parse(formData.get("ticketId"));
  const ticket = await getTicket(ticketId);
  if (!ticket) throw new Error("Ticket not found");
  const me = session.email.toLowerCase();
  const watching = ticket.watchers.some((w) => w.toLowerCase() === me);
  const watchers = watching
    ? ticket.watchers.filter((w) => w.toLowerCase() !== me)
    : [...ticket.watchers, session.email];
  await updateTicket(ticketId, { watchers });
  await audit("human", session.email, watching ? "ticket.unwatched" : "ticket.watched", { type: "ticket", id: ticketId });
  refresh(ticketId);
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

/** Collision detection heartbeat: mark me as viewing this ticket and return any
 *  other agents currently here too. Polled by the ticket view; best-effort. */
export async function presenceHeartbeatAction(ticketId: string): Promise<{ viewers: Viewer[] }> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(ticketId);
  const name = session.name && !session.name.includes("@") ? session.name : null;
  try {
    return { viewers: await heartbeatPresence(id, session.email, name) };
  } catch (error) {
    console.error("presenceHeartbeatAction failed:", error);
    return { viewers: [] };
  }
}

const unmergeSchema = z.object({ ticketId: z.string().uuid(), noteId: z.string().uuid() });

/** Reverse a merge from the "Merged in" note on the target ticket. */
export async function unmergeTicketAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { ticketId, noteId } = unmergeSchema.parse(Object.fromEntries(formData));
  await unmergeTickets(ticketId, noteId, session.email);
  refresh(ticketId);
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
