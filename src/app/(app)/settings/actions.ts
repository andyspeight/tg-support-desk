"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import {
  addBlockedSender,
  audit,
  createCannedResponse,
  createTag,
  deleteCannedResponse,
  deleteTag,
  removeBlockedSender,
  updateCannedResponse,
} from "@/lib/db/queries";

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
