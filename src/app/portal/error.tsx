"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Client-facing safety net: any unhandled error in the support portal shows a
// calm, recoverable card rather than a crash page.
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Portal error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h1 className="mt-4 text-base font-semibold text-ink">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          Sorry — that didn’t go through. Please try again. If it keeps happening, raising a ticket still works and our team will help.
        </p>
        {error.digest && <p className="mt-2 font-mono text-[11px] text-ink-3">ref: {error.digest}</p>}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} /> Try again
          </button>
          <Link
            href="/portal"
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
          >
            Back to support
          </Link>
        </div>
      </div>
    </div>
  );
}
