"use client";

import { useFormStatus } from "react-dom";

// Submit button for the Run-AI form. Shows a pending state and disables itself
// while the resolution agent is running, so a slow run can't be double-fired
// into multiple concurrent resolutions.
export function RunAiButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
          aria-hidden
        />
      )}
      {pending ? "Running the AI…" : "Run AI on this ticket"}
    </button>
  );
}
