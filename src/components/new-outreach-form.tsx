"use client";

import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-400"
    >
      <Sparkles className="h-4 w-4" strokeWidth={1.75} />
      {pending ? "Drafting…" : "Create & draft message"}
    </button>
  );
}

/** Raise a proactive outreach: supplier, what's wrong, and the affected clients.
 *  On submit the AI drafts the message and we land on the review screen. */
export function NewOutreachForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-ink-2">Supplier / system affected</span>
          <input
            name="supplier"
            required
            maxLength={120}
            placeholder="e.g. Amadeus"
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink-3 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-2">What’s happening (one line)</span>
          <input
            name="summary"
            required
            maxLength={300}
            placeholder="e.g. Flight search intermittently failing"
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink-3 focus:outline-none"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-ink-2">Detail for the AI (optional)</span>
        <textarea
          name="detail"
          rows={3}
          maxLength={4000}
          placeholder="Anything the AI should know: what’s affected, the cause if known, what clients should do. Leave out any ETA you’re unsure of — the AI won’t invent one."
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink-3 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-ink-2">Affected clients</span>
        <textarea
          name="recipients"
          required
          rows={4}
          maxLength={20000}
          placeholder={"One client per line —\njo@agency.com\nSam Patel <sam@toursco.com>"}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-ink-3 focus:outline-none"
        />
        <span className="mt-1 block text-[11px] text-ink-3">
          One client per line: an email, or “Name &lt;email&gt;”. The greeting is personalised per client.
        </span>
      </label>
      <SubmitButton />
    </form>
  );
}
