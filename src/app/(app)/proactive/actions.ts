"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import {
  audit,
  createOutreachIncident,
  getOutreachIncident,
  updateOutreachIncident,
} from "@/lib/db/queries";
import { draftOutreach } from "@/lib/ai/copilot";
import { sendOutreachToRecipient } from "@/lib/channels/outreach-send";
import { listAllClients } from "@/lib/integrations/airtable-clients";
import { parseRecipients, supplierSlug, type OutreachDraftResult, type OutreachSendResult } from "@/lib/outreach";
import type { OutreachRecipient } from "@/lib/db/types";
import type { Json } from "@/lib/db/database.types";

// Hard safety cap on any single outreach.
const RECIPIENT_CAP = 2000;
// Sends up to this many go immediately from the action; larger ones (e.g. "all
// clients") are queued to the paced background drainer so they don't time out.
const INLINE_MAX = 20;

const createSchema = z.object({
  supplier: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(4000).optional(),
  recipients: z.string().trim().max(20000).optional(),
  allClients: z.string().optional(),
});

/** Raise an incident, resolve the affected clients (an explicit list, or every
 *  client from the Airtable Clients base), and AI-draft the message so the agent
 *  lands on a ready-to-review outreach. */
export async function createOutreachAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const input = createSchema.parse(Object.fromEntries(formData));
  const toAllClients = Boolean(input.allClients);

  const recipients: OutreachRecipient[] = (
    toAllClients ? await listAllClients() : parseRecipients(input.recipients ?? "")
  ).slice(0, RECIPIENT_CAP);

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
    all_clients: toAllClients,
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

/**
 * Send the reviewed message. A small send goes out immediately, one ticket +
 * branded email per client, so a reply threads straight back into the desk. A
 * large send (e.g. all clients) is queued to the paced background drainer
 * instead — the review screen then shows the send progressing.
 */
export async function sendOutreachAction(incidentId: string, message: string): Promise<OutreachSendResult> {
  const session = await requireAgent();
  const parsed = sendSchema.safeParse({ incidentId, message });
  if (!parsed.success) return { ok: false, error: "Add a message before sending." };

  const incident = await getOutreachIncident(incidentId);
  if (!incident) return { ok: false, error: "Incident not found." };
  if (incident.status === "sent" || incident.status === "sending") {
    return { ok: false, error: "This outreach is already sending or sent." };
  }

  const recipients = ((incident.recipients as unknown as OutreachRecipient[]) ?? []).slice(0, RECIPIENT_CAP);
  if (recipients.length === 0) return { ok: false, error: "No recipients to send to." };

  // Large send → queue for the paced drainer, which sends in batches.
  if (recipients.length > INLINE_MAX) {
    await updateOutreachIncident(incidentId, {
      draft_message: message,
      status: "sending",
      sent_count: 0,
      done_emails: [] as unknown as Json,
      sent_at: null,
    });
    await audit("human", session.email, "outreach.queued", { type: "outreach", id: incidentId }, {
      supplier: incident.supplier,
      recipients: recipients.length,
    });
    revalidatePath(`/proactive/${incidentId}`);
    revalidatePath("/proactive");
    return { ok: true, sent: 0, failed: 0, queued: recipients.length };
  }

  // Small send → do it now.
  const opts = {
    slug: supplierSlug(incident.supplier),
    subject: incident.summary.slice(0, 150),
    author: session.email,
    message,
  };
  let sent = 0;
  const done: string[] = [];
  const failed: string[] = [];
  for (const recipient of recipients) {
    try {
      await sendOutreachToRecipient(opts, recipient);
      sent += 1;
    } catch (error) {
      failed.push(recipient.email);
      console.error(`outreach send to ${recipient.email} failed:`, error);
    }
    done.push(recipient.email.toLowerCase());
  }

  await updateOutreachIncident(incidentId, {
    draft_message: message,
    status: sent > 0 ? "sent" : incident.status,
    sent_at: sent > 0 ? new Date().toISOString() : incident.sent_at,
    sent_count: sent,
    done_emails: done as unknown as Json,
  });
  await audit("human", session.email, "outreach.sent", { type: "outreach", id: incidentId }, {
    supplier: incident.supplier,
    sent,
    failed: failed.length,
  });

  revalidatePath(`/proactive/${incidentId}`);
  revalidatePath("/proactive");
  return { ok: true, sent, failed: failed.length, queued: 0 };
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
