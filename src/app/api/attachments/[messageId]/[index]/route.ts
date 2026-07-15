import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMessageById, getTicket } from "@/lib/db/queries";
import { companyForEmail } from "@/lib/portal-company";
import { signedAttachmentUrl } from "@/lib/channels/attachments";
import type { StoredAttachment } from "@/lib/channels/attachment-rules";

export const dynamic = "force-dynamic";

// Attachments live in a private bucket. This route verifies the session, then
// 302-redirects to a short-lived signed URL. By default the file is served
// inline (so images/PDFs can be viewed in the browser); ?download=1 forces a
// download. Inline viewing is safe — the bucket is a separate, script-less
// origin and the allowlist has no active types (no SVG/HTML). Agents may see any
// attachment; a client may see their own ticket's, or a colleague's at the same
// client company (same rule as the portal thread they can already open).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ messageId: string; index: string }> },
) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { messageId, index } = await params;
  const message = await getMessageById(messageId);
  if (!message) return new NextResponse("Not found", { status: 404 });

  if (!session.isAgent) {
    const ticket = await getTicket(message.ticket_id);
    if (!ticket) return new NextResponse("Forbidden", { status: 403 });
    const mine = ticket.requester_email.toLowerCase() === session.email.toLowerCase();
    let allowed = mine;
    if (!allowed && ticket.client_id && ticket.status !== "awaiting_approval" && !ticket.tags.includes("spam")) {
      const company = await companyForEmail(session.email);
      allowed = Boolean(company && ticket.client_id === company.id);
    }
    if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  }

  const attachments = (message.attachments as unknown as StoredAttachment[]) ?? [];
  const attachment = attachments[Number(index)];
  if (!attachment?.stored || !attachment.storageKey) {
    return new NextResponse("Not available", { status: 404 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const url = await signedAttachmentUrl(attachment.storageKey, attachment.filename, download);
  if (!url) return new NextResponse("Could not generate link", { status: 500 });

  return NextResponse.redirect(url);
}
