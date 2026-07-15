"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { env } from "@/lib/env";
import { eraseCustomerData } from "@/lib/gdpr";
import {
  addAllowedSender,
  addAllowedSenders,
  addBlockedSender,
  audit,
  createCannedResponse,
  createTag,
  deleteCannedResponse,
  deleteCompanyMember,
  deleteTag,
  removeAllowedSender,
  removeBlockedSender,
  stampTicketsForEmail,
  updateCannedResponse,
  upsertCompanyMember,
} from "@/lib/db/queries";
import { companyNameFrom, createClientCompany, getClientById, matchClientByEmail } from "@/lib/integrations/airtable-clients";
import { invalidateCompanyFor } from "@/lib/portal-company";

export type EraseResult = { ok: boolean; message: string };

// GDPR right-to-erasure. Owner-only (destructive); requires the email typed
// twice as a confirmation guard.
export async function eraseCustomerDataAction(formData: FormData): Promise<EraseResult> {
  const session = await requireAgent();
  if (!env.ownerEmails.includes(session.email)) {
    return { ok: false, message: "Only an owner can erase customer data." };
  }
  const email = String(formData.get("email") ?? "").trim();
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (!email) return { ok: false, message: "Enter the customer's email address." };
  if (confirm.toLowerCase() !== email.toLowerCase()) {
    return { ok: false, message: "Type the same email in the confirm box to proceed." };
  }
  const res = await eraseCustomerData(email, session.email);
  revalidatePath("/staff/settings");
  if (res.tickets === 0) return { ok: false, message: `No tickets found for ${email}.` };
  return { ok: true, message: `Erased ${res.tickets} ticket(s) and ${res.attachments} attachment(s) for ${email}.` };
}

const cannedSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
});

export async function createCannedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { title, body } = cannedSchema.parse(Object.fromEntries(formData));
  await createCannedResponse(title, body, session.email);
  await audit("human", session.email, "canned.created", undefined, { title });
  revalidatePath("/staff/settings");
}

const cannedUpdateSchema = cannedSchema.extend({ id: z.string().uuid() });

export async function updateCannedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { id, title, body } = cannedUpdateSchema.parse(Object.fromEntries(formData));
  await updateCannedResponse(id, title, body);
  await audit("human", session.email, "canned.updated", undefined, { id });
  revalidatePath("/staff/settings");
}

export async function deleteCannedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteCannedResponse(id);
  await audit("human", session.email, "canned.deleted", undefined, { id });
  revalidatePath("/staff/settings");
}

const tagSchema = z.object({
  name: z.string().trim().min(1).max(50).transform((s) => s.toLowerCase()),
  color: z.string().trim().max(20).optional(),
});

export async function createTagAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { name, color } = tagSchema.parse(Object.fromEntries(formData));
  await createTag(name, color || null);
  await audit("human", session.email, "tag.created", undefined, { name });
  revalidatePath("/staff/settings");
}

export async function deleteTagAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteTag(id);
  await audit("human", session.email, "tag.deleted", undefined, { id });
  revalidatePath("/staff/settings");
}

const blockSchema = z.object({
  // exact address, or a "@domain.com" rule
  pattern: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(/^@?[^@\s]+(\.[^@\s]+)+$|^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter an email or @domain"),
});

export async function addBlockedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { pattern } = blockSchema.parse(Object.fromEntries(formData));
  await addBlockedSender(pattern, session.email);
  await audit("human", session.email, "spam.sender_blocked", undefined, { pattern });
  revalidatePath("/staff/settings");
}

export async function removeBlockedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("id"));
  await removeBlockedSender(id);
  await audit("human", session.email, "spam.sender_unblocked", undefined, { id });
  revalidatePath("/staff/settings");
}

// Allow-list: senders/domains trusted to skip the unknown-sender approval queue.
const PATTERN_RE = /^@?[^@\s]+(\.[^@\s]+)+$|^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const allowSchema = z.object({
  pattern: z.string().trim().min(3).max(120).regex(PATTERN_RE, "Enter an email or @domain"),
});

/** Lenient parse for the bulk-import box: split on any whitespace/comma/semicolon,
 *  keep only well-formed addresses or @domain rules, de-dupe. */
function parsePatternList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => PATTERN_RE.test(s)),
    ),
  ];
}

export async function addAllowedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { pattern } = allowSchema.parse(Object.fromEntries(formData));
  await addAllowedSender(pattern, session.email);
  await audit("human", session.email, "allowlist.sender_added", undefined, { pattern });
  revalidatePath("/staff/settings");
}

export async function removeAllowedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("id"));
  await removeAllowedSender(id);
  await audit("human", session.email, "allowlist.sender_removed", undefined, { id });
  revalidatePath("/staff/settings");
}

export async function importAllowedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const patterns = parsePatternList(String(formData.get("patterns") ?? "")).slice(0, 5000);
  if (patterns.length === 0) return;
  const added = await addAllowedSenders(patterns, session.email);
  await audit("human", session.email, "allowlist.bulk_imported", undefined, { submitted: patterns.length, added });
  revalidatePath("/staff/settings");
}

const linkCompanySchema = z.object({
  email: z.string().trim().email().max(200),
  // "none" = explicitly no company (blocks email/domain matching); otherwise an
  // Airtable record id (constrained to shape so it can't alter the API path).
  clientId: z.string().trim().refine((v) => v === "none" || /^rec[A-Za-z0-9]{14}$/.test(v), "invalid company id"),
});

/** Link a user's email to a client company (or explicitly to none). Overrides
 *  the Airtable email/domain matching, backfills the email's historic tickets
 *  onto the company, and shows up on the portal immediately. */
export async function linkCompanyMemberAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { email, clientId } = linkCompanySchema.parse({
    email: formData.get("email"),
    clientId: formData.get("clientId"),
  });
  const none = clientId === "none";
  // Display name comes from the Airtable record (canonical), never the form.
  let clientName: string | null = null;
  if (!none) {
    const record = await getClientById(clientId);
    if (!record) throw new Error("That company record no longer exists in Airtable.");
    clientName = companyNameFrom(record);
  }
  await upsertCompanyMember({
    email,
    clientId: none ? null : clientId,
    clientName,
    createdBy: session.email,
  });
  let stamped = 0;
  if (!none) stamped = await stampTicketsForEmail(email, clientId);
  invalidateCompanyFor(email);
  await audit("human", session.email, "company_member.linked", undefined, {
    email: email.toLowerCase(),
    client_id: none ? null : clientId,
    tickets_stamped: stamped,
  });
  revalidatePath("/staff/settings");
}

const createCompanySchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  tradingName: z.string().trim().max(200).optional(),
  contactName: z.string().trim().max(200).optional(),
  website: z.string().trim().max(300).optional(),
});

export type CreateCompanyResult = { ok: boolean; message: string };

/** Create a brand-new client company in Airtable from the desk, so staff don't
 *  have to open Airtable to onboard a company that isn't in the list yet.
 *  Agent-gated, and duplicate-guarded against the identity base. */
export async function createCompanyAction(
  _prev: CreateCompanyResult | null,
  formData: FormData,
): Promise<CreateCompanyResult> {
  const session = await requireAgent();
  if (!env.airtableWriteConfigured) return { ok: false, message: "Adding companies isn't enabled yet." };
  const parsed = createCompanySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter a company name and a valid main contact email." };
  const { companyName, email, tradingName, contactName, website } = parsed.data;

  // Don't split a company across two records: if this email already resolves to
  // a client, tell the agent to link to it instead.
  const existing = await matchClientByEmail(email).catch(() => null);
  if (existing) {
    return { ok: false, message: `${email} already belongs to ${companyNameFrom(existing)} — link them to it (below) instead of adding a new company.` };
  }
  try {
    const record = await createClientCompany({ companyName, email, tradingName, contactName, website, createdBy: session.email });
    await audit("human", session.email, "client_company.created", undefined, {
      client_id: record.id,
      email: email.toLowerCase(),
      name: companyName,
    });
    revalidatePath("/staff/settings");
    return { ok: true, message: `Added “${companyNameFrom(record)}”. It's in the company list now, and ${email}'s tickets will match it.` };
  } catch (error) {
    console.error("createCompanyAction failed:", error);
    return { ok: false, message: "Airtable wouldn't save the new company (the desk's write token may be missing create access). Nothing was saved." };
  }
}

/** Remove an explicit link — the email goes back to normal Airtable matching. */
export async function unlinkCompanyMemberAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("id"));
  const removed = await deleteCompanyMember(id);
  if (removed) {
    invalidateCompanyFor(removed.email);
    await audit("human", session.email, "company_member.unlinked", undefined, {
      email: removed.email,
      client_id: removed.client_id,
    });
  }
  revalidatePath("/staff/settings");
}
