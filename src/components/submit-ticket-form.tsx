"use client";

import { useState } from "react";
import { BookOpen, CheckCircle2, Lightbulb, Loader2, ArrowUpRight, Plus } from "lucide-react";
import type { SubmitResult } from "@/app/submit/actions";
import type { DraftAssist } from "@/lib/ai/copilot";
import { AttachmentPicker } from "@/components/attachment-picker";

const FIELD =
  "w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20";

function hasHelp(a: DraftAssist | null): a is DraftAssist {
  return !!a && (a.suggestions.length > 0 || !!a.article);
}

export function SubmitTicketForm({
  submit,
  assist,
}: {
  submit: (formData: FormData) => Promise<SubmitResult>;
  assist: (input: { subject: string; message: string }) => Promise<DraftAssist>;
}) {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", company: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: number } | null>(null);
  const [assistResult, setAssistResult] = useState<DraftAssist | null>(null);
  const [reviewed, setReviewed] = useState(false); // the pre-submit pause happens at most once

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function doSubmit() {
    setSending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("name", form.name);
      fd.set("email", form.email);
      fd.set("subject", form.subject);
      fd.set("message", form.message);
      fd.set("company", form.company);
      for (const f of files) fd.append("files", f);
      const res = await submit(fd);
      if (res.ok) setDone({ reference: res.reference });
      else setError(res.error);
    } catch {
      setError("Something went wrong sending that — please try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || checking) return;

    // First attempt: take a quick look. If there's anything worth reading,
    // pause and let them decide — otherwise send straight through.
    if (!reviewed) {
      let result: DraftAssist | null = null;
      if (form.message.trim().length >= 15) {
        setChecking(true);
        try {
          result = await assist({ subject: form.subject, message: form.message });
        } catch {
          result = null;
        }
        setChecking(false);
        setAssistResult(result);
      }
      setReviewed(true);
      if (hasHelp(result)) return; // pause for confirmation
    }

    await doSubmit();
  }

  // Reset back to a blank request — keep the name/email so the same person can
  // raise another without retyping who they are.
  function reset() {
    setForm((f) => ({ ...f, subject: "", message: "", company: "" }));
    setFiles([]);
    setAssistResult(null);
    setReviewed(false);
    setError(null);
    setDone(null);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-[0_20px_45px_-25px_rgba(27,43,91,0.4)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Thanks, {form.name.split(/\s+/)[0] || "there"} — we’ve got it</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-2">
          {done.reference > 0 ? (
            <>
              Your request is in the queue as ticket <span className="font-medium tabular-nums">#{done.reference}</span>.
              We’ll reply to <span className="font-medium">{form.email}</span>.
            </>
          ) : (
            <>Your request has been received. We’ll reply to {form.email}.</>
          )}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-2 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30"
        >
          <Plus className="h-4 w-4" strokeWidth={2} /> Submit another request
        </button>
      </div>
    );
  }

  const paused = reviewed && hasHelp(assistResult);

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-[0_20px_45px_-25px_rgba(27,43,91,0.4)] sm:p-7"
    >
      {/* Honeypot — hidden from people, catches bots. */}
      <input
        type="text"
        name="company"
        value={form.company}
        onChange={set("company")}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-medium text-ink-2">
            Your name
          </label>
          <input id="name" required maxLength={120} value={form.name} onChange={set("name")} placeholder="Jordan Hale" className={FIELD} />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink-2">
            Email
          </label>
          <input id="email" type="email" required maxLength={200} value={form.email} onChange={set("email")} placeholder="you@yourcompany.com" className={FIELD} />
        </div>
      </div>

      <div>
        <label htmlFor="subject" className="mb-1 block text-xs font-medium text-ink-2">
          Subject
        </label>
        <input id="subject" required minLength={3} maxLength={200} value={form.subject} onChange={set("subject")} placeholder="What’s it about?" className={FIELD} />
      </div>

      <div>
        <label htmlFor="message" className="mb-1 block text-xs font-medium text-ink-2">
          How can we help?
        </label>
        <textarea
          id="message"
          required
          minLength={10}
          maxLength={8000}
          rows={6}
          value={form.message}
          onChange={set("message")}
          placeholder="Tell us what’s happening — include any error messages, the page you’re on, and what you expected."
          className={`${FIELD} resize-y leading-relaxed`}
        />
      </div>

      {/* Pre-submit help. Shown only when we paused — they read, then confirm. */}
      {paused && (
        <div className="space-y-3 rounded-xl border border-accent-200 bg-accent-50/60 p-4 dark:border-accent-500/25 dark:bg-accent-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-300">Before you send</p>
          {assistResult!.article && (
            <a
              href={assistResult!.article.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-2.5 text-sm text-ink hover:text-accent-700 dark:hover:text-accent-300"
            >
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-300" strokeWidth={1.75} />
              <span>
                This might already solve it: <span className="font-medium underline-offset-2 group-hover:underline">{assistResult!.article.title}</span>
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
        <label className="mb-1.5 block text-xs font-medium text-ink-2">Attachments (optional)</label>
        <AttachmentPicker onFilesChange={setFiles} />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300" role="alert">
          {error}
        </div>
      )}

      {paused && (
        <p className="text-sm text-ink-2">
          Had a read? If you’d still like our team to take it on, submit your ticket.
        </p>
      )}

      <button
        type="submit"
        disabled={sending || checking}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-700 active:translate-y-px disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 sm:w-auto"
      >
        {(sending || checking) && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={2} />}
        {checking ? "Taking a look…" : sending ? "Sending…" : paused ? "Submit my ticket anyway" : "Send request"}
      </button>
    </form>
  );
}
