"use client";

import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";

/** Submit button for the insights refresh form — shows a pending state while the
 *  (few-second) recompute + AI clustering call runs. */
export function RefreshInsightsButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} strokeWidth={1.75} />
      {pending ? "Refreshing…" : "Refresh now"}
    </button>
  );
}
