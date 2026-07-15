"use client";

import { useActionState } from "react";
import { Building2 } from "lucide-react";
import type { CreateCompanyResult } from "@/app/staff/settings/actions";

type Action = (prev: CreateCompanyResult | null, formData: FormData) => Promise<CreateCompanyResult>;

const inputCls =
  "w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none";

/** Onboard a client company from the desk (writes to the Airtable Clients base)
 *  so staff never have to open Airtable for a company that isn't listed yet. */
export function AddCompanyForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-line-soft pt-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        <Building2 className="h-3.5 w-3.5 text-ink-3" strokeWidth={1.75} /> Add a new company
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="companyName" required maxLength={200} placeholder="Company name" className={inputCls} aria-label="Company name" />
        <input name="email" type="email" required maxLength={200} placeholder="Main contact email" className={inputCls} aria-label="Main contact email" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="tradingName" maxLength={200} placeholder="Trading name (optional)" className={inputCls} aria-label="Trading name" />
        <input name="contactName" maxLength={200} placeholder="Contact name (optional)" className={inputCls} aria-label="Contact name" />
        <input name="website" maxLength={300} placeholder="Website (optional)" className={inputCls} aria-label="Website" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-surface-2 dark:text-ink dark:hover:bg-line"
        >
          {pending ? "Adding…" : "Add company"}
        </button>
        {state && (
          <span
            className={`text-xs ${state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
            role="status"
          >
            {state.message}
          </span>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-ink-3">
        Creates the record in the Airtable Clients base and adds it to the picker above. The main contact email is how
        their tickets match — a colleague on the same company domain matches automatically too.
      </p>
    </form>
  );
}
