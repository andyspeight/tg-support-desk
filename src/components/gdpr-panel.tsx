"use client";

import { useState, useTransition } from "react";
import { Download, ShieldAlert } from "lucide-react";
import type { EraseResult } from "@/app/staff/settings/actions";

// Owner-only GDPR tools: export everything held for a customer email (download),
// or erase it (right to be forgotten). Erase needs the email typed twice.
export function GdprPanel({ erase }: { erase: (formData: FormData) => Promise<EraseResult> }) {
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<EraseResult | null>(null);
  const [pending, start] = useTransition();

  const trimmed = email.trim();
  const exportHref = trimmed ? `/api/gdpr/export?email=${encodeURIComponent(trimmed)}` : undefined;

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Data requests (GDPR)</h2>
      <p className="mt-1 text-xs text-ink-3">
        Export or erase everything held for a customer email — their tickets, message threads and
        attachments. Erase is permanent.
      </p>

      <label className="mt-3 block text-xs font-medium text-ink-2">Customer email</label>
      <input
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setResult(null);
        }}
        placeholder="name@example.com"
        className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={exportHref}
          aria-disabled={!trimmed}
          className={`inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium ${
            trimmed ? "text-ink hover:bg-surface-2" : "pointer-events-none text-ink-3 opacity-50"
          }`}
        >
          <Download className="h-4 w-4" strokeWidth={1.75} /> Export data
        </a>
      </div>

      <details className="mt-4 border-t border-line-soft pt-3">
        <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-red-700 dark:text-red-400">
          <ShieldAlert className="h-4 w-4" strokeWidth={1.75} /> Erase customer data
        </summary>
        <p className="mt-2 text-xs text-ink-3">
          This permanently deletes every ticket, message and attachment for <strong>{trimmed || "the email above"}</strong>. It cannot be undone. Type the email again to confirm.
        </p>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-type the email to confirm"
          className="mt-2 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm placeholder:text-ink-3 focus:border-red-400 focus:outline-none"
        />
        <button
          type="button"
          disabled={pending || !trimmed || confirm.trim().toLowerCase() !== trimmed.toLowerCase()}
          onClick={() => {
            const fd = new FormData();
            fd.set("email", trimmed);
            fd.set("confirm", confirm.trim());
            start(async () => {
              const r = await erase(fd);
              setResult(r);
              if (r.ok) setConfirm("");
            });
          }}
          className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
        >
          {pending ? "Erasing…" : "Erase permanently"}
        </button>
      </details>

      {result && (
        <p
          className={`mt-3 text-xs ${
            result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
          }`}
        >
          {result.message}
        </p>
      )}
    </section>
  );
}
