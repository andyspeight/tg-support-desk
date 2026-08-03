"use client";

import { useState, useTransition } from "react";
import { ImageDown, Loader2 } from "lucide-react";
import type { EraseResult } from "@/app/staff/settings/actions";

/**
 * Owner-only maintenance: re-fetch client attachments that were refused before
 * the desk resolved generic MIME types (Outlook sends screenshots as
 * "application/octet-stream"). The originals are still in the support mailbox,
 * so this pulls them back onto their tickets. Safe to run more than once.
 */
export function AttachmentRecoveryPanel({ recover }: { recover: () => Promise<EraseResult> }) {
  const [result, setResult] = useState<EraseResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Recover blocked attachments</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-3">
        Screenshots sent from Outlook were refused because it labels them as generic files rather than images. That&apos;s
        fixed for new tickets — this fetches the earlier ones back from the support mailbox and attaches them to their
        tickets. Anything genuinely not an allowed file type stays blocked.
      </p>

      <button
        onClick={() => start(async () => setResult(await recover()))}
        disabled={pending}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={1.75} />
        ) : (
          <ImageDown className="h-4 w-4" strokeWidth={1.75} />
        )}
        {pending ? "Recovering…" : "Recover attachments"}
      </button>

      {result && (
        <p
          className={`mt-2 text-xs ${
            result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
          }`}
        >
          {result.message}
        </p>
      )}
    </section>
  );
}
