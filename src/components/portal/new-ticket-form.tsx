"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, BookOpen, Lightbulb, Loader2, Paperclip } from "lucide-react";
import type { DraftAssist } from "@/lib/ai/copilot";
import { safeHttpUrl } from "@/lib/kb-links";
import { AttachmentPicker, type AttachmentPickerHandle } from "@/components/attachment-picker";
import { mentionsAttachment } from "@/lib/attachment-hint";
import { imageFilesFrom } from "@/lib/clipboard-images";

const FIELD =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20";

function hasHelp(a: DraftAssist | null): a is DraftAssist {
  return !!a && (a.suggestions.length > 0 || !!a.article);
}

export function NewTicketForm({
  raise,
  assist,
  defaultSubject,
  defaultBody,
  signedIn,
}: {
  raise: (formData: FormData) => Promise<void>;
  assist: (input: { subject: string; message: string }) => Promise<DraftAssist>;
  defaultSubject?: string;
  defaultBody?: string;
  signedIn: boolean;
}) {
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [message, setMessage] = useState(defaultBody ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [assistResult, setAssistResult] = useState<DraftAssist | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [attachNudged, setAttachNudged] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const pickerRef = useRef<AttachmentPickerHandle>(null);

  // Build the payload by hand and append the tracked File objects directly, so
  // the upload never depends on a file input's .files being programmatically
  // writable (unreliable on iOS Safari and some mobile browsers — the reason
  // portal screenshots were silently not arriving).
  async function doSubmit() {
    const form = formRef.current;
    if (!form) return;
    setSubmitting(true);
    const fd = new FormData(form);
    fd.delete("files");
    for (const f of files) fd.append("files", f);
    await raise(fd); // server action redirects on success
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (checking || submitting) return;

    // First: a quick KB look — may pause to suggest an article before sending.
    if (!reviewed) {
      let result: DraftAssist | null = null;
      if (message.trim().length >= 15) {
        setChecking(true);
        try {
          result = await assist({ subject, message });
        } catch {
          result = null;
        }
        setChecking(false);
        setAssistResult(result);
      }
      setReviewed(true);
      if (hasHelp(result)) return; // pause for confirmation
    }

    // Catch the "I've attached screenshots" case where nothing was actually
    // added — a common way images go missing. Warn once, then let them send.
    if (files.length === 0 && !attachNudged && mentionsAttachment(message)) {
      setAttachNudged(true);
      return;
    }

    await doSubmit();
  }

  const paused = reviewed && hasHelp(assistResult);
  const attachWarning = attachNudged && files.length === 0;

  return (
    <form ref={formRef} action={raise} onSubmit={onSubmit} className="space-y-3">
      {!signedIn && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              required
              maxLength={120}
              autoComplete="name"
              placeholder="Your name"
              className={FIELD}
            />
            <input
              name="email"
              type="email"
              required
              maxLength={200}
              autoComplete="email"
              placeholder="Your email"
              className={FIELD}
            />
          </div>
          <p className="text-xs text-ink-3">We’ll email ticket updates here — no account needed.</p>
        </div>
      )}
      <input
        name="subject"
        required
        minLength={3}
        maxLength={200}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className={`${FIELD} font-medium`}
      />
      <textarea
        name="body"
        required
        minLength={5}
        maxLength={8000}
        rows={8}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        // Pasted screenshots attach instead of vanishing into the textarea.
        onPaste={(e) => {
          const images = imageFilesFrom(e.clipboardData);
          if (images.length === 0) return;
          e.preventDefault();
          pickerRef.current?.add(images);
        }}
        onDrop={(e) => {
          const images = imageFilesFrom(e.dataTransfer);
          if (images.length === 0) return;
          e.preventDefault();
          pickerRef.current?.add(images);
        }}
        placeholder="Describe what’s happening — include any error messages, the page you’re on, and what you expected. You can paste a screenshot straight in."
        className={`${FIELD} resize-y leading-relaxed`}
      />

      {paused && (
        <div className="space-y-3 rounded-xl border border-accent-200 bg-accent-50/60 p-4 dark:border-accent-500/25 dark:bg-accent-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-300">Before you send</p>
          {assistResult!.article && (
            <a
              href={safeHttpUrl(assistResult!.article.url)}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-2.5 text-sm text-ink hover:text-accent-700 dark:hover:text-accent-300"
            >
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-300" strokeWidth={1.75} />
              <span>
                This might already solve it:{" "}
                <span className="font-medium underline-offset-2 group-hover:underline">{assistResult!.article.title}</span>
                <ArrowUpRight className="ml-0.5 inline h-3.5 w-3.5" strokeWidth={2} />
              </span>
            </a>
          )}
          {assistResult!.suggestions.length > 0 && (
            <div className="flex items-start gap-2.5">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-300" strokeWidth={1.75} />
              <div className="text-sm text-ink-2">
                <p className="font-medium text-ink">Adding these would help us solve it faster</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {assistResult!.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-2">Attach screenshots or files (optional)</label>
        <AttachmentPicker ref={pickerRef} onFilesChange={setFiles} />
      </div>

      {attachWarning && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
          <Paperclip className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>
            You mentioned attachments, but nothing’s attached yet. Add your screenshots above, or press submit again to
            send without them.
          </span>
        </div>
      )}

      {paused && (
        <p className="text-sm text-ink-2">Had a read? If you’d still like the team to take it on, submit your ticket.</p>
      )}

      <button
        type="submit"
        disabled={checking || submitting}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 active:translate-y-px disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
      >
        {(checking || submitting) && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={2} />}
        {checking
          ? "Taking a look…"
          : submitting
            ? "Submitting…"
            : attachWarning
              ? "Submit without attachments"
              : paused
                ? "Submit my ticket anyway"
                : "Submit ticket"}
      </button>
    </form>
  );
}
