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
  deleteTag,
  removeAllowedSender,
  removeBlockedSender,
  updateCannedResponse,
} from "@/lib/db/queries";

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
  revalidatePath("/settings");
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
  revalidatePath("/settings");
}

const cannedUpdateSchema = cannedSchema.extend({ id: z.string().uuid() });

export async function updateCannedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { id, title, body } = cannedUpdateSchema.parse(Object.fromEntries(formData));
  await updateCannedResponse(id, title, body);
  await audit("human", session.email, "canned.updated", undefined, { id });
  revalidatePath("/settings");
}

export async function deleteCannedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteCannedResponse(id);
  await audit("human", session.email, "canned.deleted", undefined, { id });
  revalidatePath("/settings");
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
  revalidatePath("/settings");
}

export async function deleteTagAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteTag(id);
  await audit("human", session.email, "tag.deleted", undefined, { id });
  revalidatePath("/settings");
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
  revalidatePath("/settings");
}

export async function removeBlockedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("id"));
  await removeBlockedSender(id);
  await audit("human", session.email, "spam.sender_unblocked", undefined, { id });
  revalidatePath("/settings");
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
  revalidatePath("/settings");
}

export async function removeAllowedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("id"));
  await removeAllowedSender(id);
  await audit("human", session.email, "allowlist.sender_removed", undefined, { id });
  revalidatePath("/settings");
}

export async function importAllowedAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const patterns = parsePatternList(String(formData.get("patterns") ?? "")).slice(0, 5000);
  if (patterns.length === 0) return;
  const added = await addAllowedSenders(patterns, session.email);
  await audit("human", session.email, "allowlist.bulk_imported", undefined, { submitted: patterns.length, added });
  revalidatePath("/settings");
}
