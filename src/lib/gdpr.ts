import "server-only";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { audit } from "@/lib/db/queries";
import { ATTACHMENTS_BUCKET } from "@/lib/channels/attachment-rules";
import type { Message, Ticket } from "@/lib/db/types";

// GDPR subject-access (export) and right-to-erasure (delete) for a customer,
// keyed by their requester email within the tenant. Owner-gated at the call
// sites (export route, settings action). Deleting a ticket cascades messages,
// ai_events, notifications, KB-usage and presence; attachments live in storage
// and are removed explicitly here.

export type CustomerExport = {
  email: string;
  ticketCount: number;
  tickets: (Ticket & { messages: Message[] })[];
};

async function ticketsForEmail(email: string): Promise<Ticket[]> {
  const { data, error } = await db()
    .from("tickets")
    .select("*")
    .eq("tenant_id", env.tenantId)
    .ilike("requester_email", email.trim());
  if (error) throw new Error(`gdpr ticketsForEmail: ${error.message}`);
  return data ?? [];
}

/** Everything held for a customer — tickets and their full message threads. */
export async function collectCustomerData(email: string): Promise<CustomerExport> {
  const lower = email.trim().toLowerCase();
  const tickets = await ticketsForEmail(lower);
  const ids = tickets.map((t) => t.id);

  let messages: Message[] = [];
  if (ids.length > 0) {
    const { data, error } = await db()
      .from("messages")
      .select("*")
      .in("ticket_id", ids)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`gdpr messages: ${error.message}`);
    messages = data ?? [];
  }

  return {
    email: lower,
    ticketCount: tickets.length,
    tickets: tickets.map((t) => ({ ...t, messages: messages.filter((m) => m.ticket_id === t.id) })),
  };
}

/** Erase everything held for a customer. Removes attachment objects from
 *  storage, then deletes the tickets (children cascade). The erasure itself is
 *  audited for accountability — that record holds no message content. */
export async function eraseCustomerData(email: string, actor: string): Promise<{ tickets: number; attachments: number }> {
  const lower = email.trim().toLowerCase();
  const tickets = await ticketsForEmail(lower);
  const ids = tickets.map((t) => t.id);
  if (ids.length === 0) return { tickets: 0, attachments: 0 };

  // Gather attachment storage keys from every message before the rows go.
  const { data: msgs, error: mErr } = await db().from("messages").select("attachments").in("ticket_id", ids);
  if (mErr) throw new Error(`gdpr collect attachments: ${mErr.message}`);
  const keys: string[] = [];
  for (const m of msgs ?? []) {
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    for (const a of atts) {
      if (a && typeof a === "object" && "storageKey" in a && typeof a.storageKey === "string") keys.push(a.storageKey);
    }
  }
  if (keys.length > 0) {
    const { error } = await db().storage.from(ATTACHMENTS_BUCKET).remove(keys);
    if (error) throw new Error(`gdpr remove attachments: ${error.message}`);
  }

  const { error: dErr } = await db().from("tickets").delete().in("id", ids);
  if (dErr) throw new Error(`gdpr delete tickets: ${dErr.message}`);

  await audit("human", actor, "gdpr.erase", undefined, {
    email: lower,
    tickets: ids.length,
    references: tickets.map((t) => t.reference),
    attachments: keys.length,
  });

  return { tickets: ids.length, attachments: keys.length };
}
