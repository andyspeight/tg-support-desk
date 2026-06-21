import Link from "next/link";
import { requireClient } from "@/lib/auth";
import { raiseTicketAction } from "@/app/portal/actions";
import { SubmitButton } from "@/components/portal/submit-button";

export default async function NewTicketPage() {
  await requireClient();

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/portal" className="text-xs text-ink-3 hover:underline">
        ← Back
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Raise a ticket</h1>
      <p className="mt-1 text-sm text-ink-2">
        Tell us what’s happening. The assistant takes a first look straight away, and the team follows up.
      </p>

      <form action={raiseTicketAction} className="mt-5 space-y-3">
        <input
          name="subject"
          required
          maxLength={200}
          placeholder="Subject"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
        />
        <textarea
          name="body"
          required
          rows={8}
          maxLength={8000}
          placeholder="Describe what’s happening — include any error messages, the page you’re on, and what you expected."
          className="w-full resize-y rounded-md border border-line bg-surface p-3 text-sm leading-relaxed placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
        />
        <SubmitButton pendingLabel="Submitting…">Submit ticket</SubmitButton>
      </form>
    </div>
  );
}
