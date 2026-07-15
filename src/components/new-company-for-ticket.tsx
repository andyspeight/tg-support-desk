"use client";

import { useActionState } from "react";
import type { NewCompanyResult } from "@/app/staff/ticket/actions";

type Action = (prev: NewCompanyResult | null, formData: FormData) => Promise<NewCompanyResult>;

/** Create a new client company from an unmatched ticket and link this requester
 *  to it in one step — for a company that isn't in the picker yet. */
export function NewCompanyForTicket({
  action,
  ticketId,
  requesterEmail,
}: {
  action: Action;
  ticketId: string;
  requesterEmail: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="mt-3 border-t border-line-soft pt-2.5">
      <p className="text-[11px] font-medium text-ink-2">Not listed? Add the company</p>
      <div className="mt-1.5 flex gap-1.5">
        <input type="hidden" name="ticketId" value={ticketId} />
        <input
          name="companyName"
          required
          maxLength={200}
          placeholder="New company name"
          aria-label="New company name"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
        />
        <button
          disabled={pending}
          className="shrink-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        >
          {pending ? "Adding…" : "Create & link"}
        </button>
      </div>
      {state ? (
        <p className={`mt-1.5 text-[11px] ${state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} role="status">
          {state.message}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
          Creates the company in Airtable from {requesterEmail} and links this ticket to it.
        </p>
      )}
    </form>
  );
}
