import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMessageById } from "@/lib/db/queries";
import { signedAttachmentUrl } from "@/lib/channels/attachments";
import type { StoredAttachment } from "@/lib/channels/attachment-rules";

export const dynamic = "force-dynamic";

// Attachments live in a private bucket. This route verifies the agent session,
// then 302-redirects to a short-lived signed URL — the bucket is never public
// and the file is delivered as a download, never rendered inline.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string; index: string }> },
) {
  const session = await getSession();
  if (!session?.isAgent) return new NextResponse("Unauthorized", { status: 401 });

  const { messageId, index } = await params;
  const message = await getMessageById(messageId);
  if (!message) return new NextResponse("Not found", { status: 404 });

  const attachments = (message.attachments as unknown as StoredAttachment[]) ?? [];
  const attachment = attachments[Number(index)];
  if (!attachment?.stored || !attachment.storageKey) {
    return new NextResponse("Not available", { status: 404 });
  }

  const url = await signedAttachmentUrl(attachment.storageKey, attachment.filename);
  if (!url) return new NextResponse("Could not generate link", { status: 500 });

  return NextResponse.redirect(url);
}
