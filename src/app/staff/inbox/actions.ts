"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { audit, bulkUpdateTickets, getTicket, stampTicketsForEmail, upsertCompanyMember } from "@/lib/db/queries";
import { companyNameFrom, getClientById } from "@/lib/integrations/airtable-clients";
import { invalidateCompanyFor } from "@/lib/portal-company";
import { linkCorporateDomain } from "@/lib/company-linking";
import { notify } from "@/lib/db/notifications";
import { env } from "@/lib/env";

const bulkSchema = z.object({
  ids: z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(100)),
  op: z.enum(["assign_me", "unassign", "assign", "status", "tag"]),
  value: z.string().optional(),
});

const STATUSES = ["new", "ai_working", "waiting_on_customer", "escalated", "pending", "awaiting_supplier", "resolved", "closed"] as const;

export async function bulkUpdateTicketsAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { ids, op, value } = bulkSchema.parse(Object.fromEntries(formData));

  if (op === "assign_me") {
    await bulkUpdateTickets(ids, { assignee: session.email });
  } else if (op === "unassign") {
    await bulkUpdateTickets(ids, { assignee: null });
  } else if (op === "assign") {
    const assignee = (value ?? "").trim().toLowerCase();
    if (!assignee || !env.agentEmails.includes(assignee)) throw new Error("Unknown assignee");
    await bulkUpdateTickets(ids, { assignee });
    await notify({
      recipients: [assignee],
      skip: session.email,
      type: "assigned",
      ticketId: ids.length === 1 ? ids[0] : null,
      title: ids.length === 1 ? "You were assigned a ticket" : `You were assigned ${ids.length} tickets`,
      actor: session.email,
    });
  } else if (op === "status") {
    const status = z.enum(STATUSES).parse(value);
    const patch: Parameters<typeof bulkUpdateTickets>[1] = { status };
    if (status === "resolved" || status === "closed") patch.resolved_at = new Date().toISOString();
    await bulkUpdateTickets(ids, patch);
  } else if (op === "tag") {
    const tag = (value ?? "").trim().toLowerCase();
    if (tag) await bulkUpdateTickets(ids, { addTag: tag });
  }

  await audit("human", session.email, "ticket.bulk_update", undefined, { op, value: value ?? null, count: ids.length });
  revalidatePath("/staff/inbox");
}

const setCompanySchema = z.object({
  ticketId: z.string().uuid(),
  clientId: z.string().trim().regex(/^rec[A-Za-z0-9]{14}$/, "Invalid company id"),
});

/**
 * Set (or correct) the company on a ticket straight from the inbox. Company is a
 * property of the requester, so this links their email to the chosen company and
 * back-stamps their existing tickets — the same operation as the ticket-page
 * "link" control, just reachable inline. Membership is stored in Supabase, so it
 * needs no Airtable write access.
 */
export async function setTicketCompanyAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { ticketId, clientId } = setCompanySchema.parse(Object.fromEntries(formData));
  const ticket = await getTicket(ticketId);
  if (!ticket) throw new Error("Ticket not found");
  const record = await getClientById(clientId);
  if (!record) throw new Error("That company no longer exists in Airtable.");
  await upsertCompanyMember({
    email: ticket.requester_email,
    clientId,
    clientName: companyNameFrom(record),
    createdBy: session.email,
  });
  await stampTicketsForEmail(ticket.requester_email, clientId);
  invalidateCompanyFor(ticket.requester_email);
  await audit("human", session.email, "company_member.linked", { type: "ticket", id: ticketId }, {
    email: ticket.requester_email,
    client_id: clientId,
    via: "inbox",
  });
  // Corporate domains link the whole company so colleagues auto-associate.
  await linkCorporateDomain({
    actor: session.email,
    email: ticket.requester_email,
    clientId,
    clientName: companyNameFrom(record),
    target: { type: "ticket", id: ticketId },
  });
  revalidatePath("/staff/inbox");
}
