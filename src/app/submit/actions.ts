"use server";

import { z } from "zod";
import { headers } from "next/headers";
import {
  addMessage,
  audit,
  createTicket,
  getBlockedPatterns,
  recentActionCount,
  setMessageAttachments,
} from "@/lib/db/queries";
import { matchesBlocklist } from "@/lib/channels/email-parse";
import { storeOutboundAttachments, type OutboundFile } from "@/lib/channels/attachments";
import { assistTicketDraft, type DraftAssist } from "@/lib/ai/copilot";
import type { Json } from "@/lib/db/database.types";

// Public (unauthenticated) ticket submission for logged-out contacts. Treated as
// hostile input per the security brief (§10): validated, rate-limited by IP and
// email, honeypot-guarded, spam-blocklisted, fails closed. It never triggers the
// AI loop or sends mail — a web-form ticket just lands in the queue tagged for
// the team, so an unverified address can't be used to spoof outbound mail.

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(3).max(200),
  message: z.string().trim().min(10).max(8000),
  company: z.string().optional(), // honeypot — humans never see or fill this
});

export type SubmitResult = { ok: true; reference: number } | { ok: false; error: string };

const RATE_WINDOW_S = 600; // 10 minutes
const RATE_MAX = 5;

async function filesFrom(formData: FormData): Promise<OutboundFile[]> {
  const raw = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const out: OutboundFile[] = [];
  for (const f of raw.slice(0, 5)) {
    const content = Buffer.from(await f.arrayBuffer());
    out.push({ filename: f.name, mimeType: f.type || "application/octet-stream", size: content.length, content });
  }
  return out;
}

export async function submitPublicTicketAction(formData: FormData): Promise<SubmitResult> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    company: formData.get("company") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Please fill in every field and try again." };
  const { name, email, subject, message, company } = parsed.data;

  // Honeypot: a bot filled the hidden field. Pretend success, create nothing.
  if (company && company.trim()) return { ok: true, reference: 0 };

  const lowerEmail = email.toLowerCase();
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "unknown";

  // Rate limit on both IP and email so neither a single source nor a single
  // claimed address can flood the queue.
  if (
    (await recentActionCount(`ip:${ip}`, "public.ticket_submit", RATE_WINDOW_S)) >= RATE_MAX ||
    (await recentActionCount(lowerEmail, "public.ticket_submit", RATE_WINDOW_S)) >= RATE_MAX
  ) {
    return { ok: false, error: "We’ve had a few requests from you already — please give us a little while to respond." };
  }

  // Spam blocklist (same list the email channel uses). Silently drop.
  const blocked = await getBlockedPatterns();
  if (matchesBlocklist(lowerEmail, blocked)) {
    await audit("system", `ip:${ip}`, "public.ticket_submit", undefined, { blocked: true, email: lowerEmail });
    return { ok: true, reference: 0 };
  }

  const files = await filesFrom(formData);

  const ticket = await createTicket({
    requester_email: lowerEmail,
    requester_name: name,
    channel: "portal",
    subject,
    status: "new",
    tags: ["web-form"],
  });
  const msg = await addMessage({ ticket_id: ticket.id, role: "customer", author: lowerEmail, body_text: message });
  if (files.length > 0) {
    const stored = await storeOutboundAttachments(ticket.id, msg.id, files);
    await setMessageAttachments(msg.id, stored as unknown as Json);
  }
  // Two audit rows: one keyed on the IP and one on the email — these ARE the
  // rate-limit counters for the next submission.
  await audit("system", `ip:${ip}`, "public.ticket_submit", { type: "ticket", id: ticket.id }, { email: lowerEmail });
  await audit("human", lowerEmail, "public.ticket_submit", { type: "ticket", id: ticket.id }, { channel: "web-form" });

  return { ok: true, reference: ticket.reference };
}

const assistSchema = z.object({
  subject: z.string().max(200).optional(),
  message: z.string().max(8000).optional(),
});

/** Advisory pre-submit help: a KB article that might solve it + any missing
 *  detail. Rate-limited per IP (public, AI-backed). Never blocks a submission;
 *  any error returns empty guidance. */
export async function assistDraftAction(input: unknown): Promise<DraftAssist> {
  const parsed = assistSchema.safeParse(input);
  if (!parsed.success) return { suggestions: [], article: null };
  const subject = (parsed.data.subject ?? "").trim();
  const message = (parsed.data.message ?? "").trim();
  if (message.length < 15) return { suggestions: [], article: null };

  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "unknown";
  if ((await recentActionCount(`ip:${ip}`, "public.assist", RATE_WINDOW_S)) >= 20) {
    return { suggestions: [], article: null };
  }
  await audit("system", `ip:${ip}`, "public.assist");

  try {
    return await assistTicketDraft(subject, message);
  } catch {
    return { suggestions: [], article: null };
  }
}
