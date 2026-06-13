"use server";

import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { audit } from "@/lib/db/queries";
import { copilotDraft, copilotRephrase, copilotSummarise, copilotTranslate } from "@/lib/ai/copilot";

// Copilot actions return text for the agent to review in the reply box —
// they never send. Errors surface as a readable string the UI can show.

async function guard<T>(fn: () => Promise<T>): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const text = (await fn()) as unknown as string;
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Copilot failed" };
  }
}

const idSchema = z.string().uuid();
const textSchema = z.string().trim().min(1).max(20000);

export async function copilotDraftAction(ticketId: string) {
  const session = await requireAgent();
  const id = idSchema.parse(ticketId);
  await audit("human", session.email, "copilot.draft", { type: "ticket", id });
  return guard(() => copilotDraft(id));
}

export async function copilotSummariseAction(ticketId: string) {
  await requireAgent();
  return guard(() => copilotSummarise(idSchema.parse(ticketId)));
}

export async function copilotRephraseAction(text: string) {
  await requireAgent();
  return guard(() => copilotRephrase(textSchema.parse(text)));
}

export async function copilotTranslateAction(text: string, language: string) {
  await requireAgent();
  return guard(() => copilotTranslate(textSchema.parse(text), z.string().trim().min(2).max(40).parse(language)));
}
