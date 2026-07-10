"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import {
  audit,
  createOutreachIncident,
  createTicket,
  getOutreachIncident,
  updateOutreachIncident,
} from "@/lib/db/queries";
import { draftOutreach } from "@/lib/ai/copilot";
import { sendTicketReply } from "@/lib/channels/email";
import { parseRecipients, personaliseOutreach, type OutreachDraftResult, type OutreachSendResult } from "@/lib/outreach";
import type { OutreachRecipient } from "@/lib/db/types";
import type { Json } from "@/lib/db/database.types";

// A proactive send fans out to at most this many clients per action, to stay
// within a single request's time budget. Larger outages can be split; the trial
// scale is well under this.
const MAX_RECIPIENTS = 200;

const createSchema = z.object({
  supplier: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(4000).optional(),
  recipients: z.string().trim().min(1).max(20000),
});

/** Raise an incident, parse the affected clients, and immediately AI-draft the
 *  message so the agent lands on a ready-to-review outreach. */
export async function createOutreachAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const input = createSchema.parse(Object.fromEntries(formData));
  const recipients = parseRecipients(input.recipients).slice(0, MAX_RECIPIENTS);

  const incident = await createOutreachIncident({
    supplier: input.supplier,
    summary: input.summary,
    detail: input.detail || null,
    recipients: recipients as unknown as Json,
    source: "manual",
    created_by: session.email,
  });
  await audit("human", session.email, "outreach.created", { type: "outreach", id: incident.id }, {
    supplier: input.supplier,
    recipients: recipients.length,
  });

  // Draft now (best-effort) so the review screen isn't blank.
  try {
    const draft = await draftOutreach({ supplier: input.supplier, summary: input.summary, detail: input.detail });
    await updateOutreachIncident(incident.id, { draft_message: draft });
  } catch (error) {
    console.error("draftOutreach failed:", error);
  }

  revalidatePath("/proactive");
  redirect(`/proactive/${incident.id}`);
}

/** Re-run the AI draft; returns the new text for the review screen to load. */
export async function redraftOutreachAction(incidentId: string): Promise<OutreachDraftResult> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(incidentId);
  const incident = await getOutreachIncident(id);
  if (!incident) return { ok: false, error: "Incident not found." };
  try {
    const draft = await draftOutreach({ supplier: incident.supplier, summary: incident.summary, detail: incident.detail });
    await updateOutreachIncident(id, { draft_message: draft });
    await audit("human", session.email, "outreach.redrafted", { type: "outreach", id });
    return { ok: true, draft };
  } catch (error) {
    console.error("draftOutreach failed:", error);
    return { ok: false, error: "The AI draft couldn’t be generated just now — please try again." };
  }
}

const sendSchema = z.object({
  incidentId: z.string().uuid(),
  message: z.string().trim().min(1).max(20000),
});

function supplierSlug(supplier: string): string {
  return supplier.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "supplier";
}

/**
 * Send the reviewed message to every affected client. Each send is its own
 * ticket + branded email (personalised greeting), so a client's reply threads
 * back into the desk and the normal AI/agent flow picks it up. Best-effort per
 * recipient — one failed address never blocks the rest.
 */
export async function sendOutreachAction(incidentId: string, message: string): Promise<OutreachSendResult> {
  const session = await requireAgent();
  const parsed = sendSchema.safeParse({ incidentId, message });
  if (!parsed.success) return { ok: false, error: "Add a message before sending." };

  const incident = await getOutreachIncident(incidentId);
  if (!incident) return { ok: false, error: "Incident not found." };
  if (incident.status === "sent") return { ok: false, error: "This outreach has already been sent." };

  const recipients = ((incident.recipients as unknown as OutreachRecipient[]) ?? []).slice(0, MAX_RECIPIENTS);
  if (recipients.length === 0) return { ok: false, error: "No recipients to send to." };

  const agentName = session.name && !session.name.includes("@") ? session.name.trim() : null;
  const slug = supplierSlug(incident.supplier);
  const subject = incident.summary.slice(0, 150);

  let sent = 0;
  const failed: string[] = [];
  for (const recipient of recipients) {
    try {
      const ticket = await createTicket({
        requester_email: recipient.email,
        requester_name: recipient.name ?? null,
        subject,
        channel: "email",
        status: "waiting_on_customer",
        priority: "p3",
        tags: ["proactive", `supplier:${slug}`],
      });
      await sendTicketReply(ticket, personaliseOutreach(message, recipient.name), {
        role: "human",
        author: session.email,
        fromName: agentName ?? undefined,
        subject,
      });
      sent += 1;
    } catch (error) {
      failed.push(recipient.email);
      console.error(`outreach send to ${recipient.email} failed:`, error);
    }
  }

  await updateOutreachIncident(incidentId, {
    draft_message: message,
    status: sent > 0 ? "sent" : incident.status,
    sent_at: sent > 0 ? new Date().toISOString() : incident.sent_at,
    sent_count: sent,
  });
  await audit("human", session.email, "outreach.sent", { type: "outreach", id: incidentId }, {
    supplier: incident.supplier,
    sent,
    failed: failed.length,
  });

  revalidatePath(`/proactive/${incidentId}`);
  revalidatePath("/proactive");
  return { ok: true, sent, failed: failed.length };
}

/** Bin an incident that no longer needs outreach. */
export async function dismissOutreachAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("incidentId"));
  await updateOutreachIncident(id, { status: "dismissed" });
  await audit("human", session.email, "outreach.dismissed", { type: "outreach", id });
  revalidatePath("/proactive");
  redirect("/proactive");
}
