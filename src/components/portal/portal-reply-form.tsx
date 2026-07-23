"use client";

import { useState, useTransition } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { AttachmentPicker } from "@/components/attachment-picker";
import { mentionsAttachment } from "@/lib/attachment-hint";

/**
 * Portal reply composer. Submits the reply — and any attached files — by
 * building the FormData by hand and appending the tracked File objects, rather
 * than relying on a hidden file input's .files (which some browsers, notably
 * iOS Safari, won't let JS set — the reason portal screenshots were silently
 * not arriving). Files here therefore reach the server on every device.
 */
export function PortalReplyForm({
  ticketId,
  reply,
}: {
  ticketId: string;
  reply: (formData: FormData) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [attachNudged, setAttachNudged] = useState(false);
  const [pending, startTransition] = useTransition();

  const attachWarning = attachNudged && files.length === 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!body.trim()) return;

    // Warn once if they wrote "screenshots attached" but added nothing.
    if (files.length === 0 && !attachNudged && mentionsAttachment(body)) {
      setAttachNudged(true);
      return;
    }

    const fd = new FormData();
    fd.set("ticketId", ticketId);
    fd.set("body", body);
    for (const f of files) fd.append("files", f);

    startTransition(async () => {
      await reply(fd);
      setBody("");
      setFiles([]);
      setAttachNudged(false);
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <textarea
        name="body"
        required
        rows={4}
        maxLength={8000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a reply…"
        className="w-full resize-y rounded-xl border border-line bg-canvas p-3 text-sm leading-relaxed placeholder:text-ink-3 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
      />
      <AttachmentPicker onFilesChange={setFiles} />

      {attachWarning && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
          <Paperclip className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>
            You mentioned attachments, but nothing’s attached yet. Add them above, or press send again to reply without.
          </span>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={2} />}
          {pending ? "Sending…" : attachWarning ? "Send without attachments" : "Send reply"}
        </button>
      </div>
    </form>
  );
}
