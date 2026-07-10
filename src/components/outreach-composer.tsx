"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Sparkles } from "lucide-react";
import type { OutreachDraftResult, OutreachSendResult } from "@/lib/outreach";

type Props = {
  incidentId: string;
  initialDraft: string;
  recipientCount: number;
  redraft: (incidentId: string) => Promise<OutreachDraftResult>;
  send: (incidentId: string, message: string) => Promise<OutreachSendResult>;
};

/** Review screen: edit the AI-drafted outreach, re-draft, and send to every
 *  affected client after an explicit confirm. Human-in-the-loop by design. */
export function OutreachComposer({ incidentId, initialDraft, recipientCount, redraft, send }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState(initialDraft);
  const [busy, setBusy] = useState<null | "draft" | "send">(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const plural = recipientCount === 1 ? "" : "s";

  function onRedraft() {
    setBusy("draft");
    setError(null);
    startTransition(async () => {
      const result = await redraft(incidentId);
      if (result.ok) setMessage(result.draft);
      else setError(result.error);
      setBusy(null);
    });
  }

  function onSend() {
    if (!message.trim()) {
      setError("Add a message before sending.");
      return;
    }
    if (!window.confirm(`Send this to ${recipientCount} client${plural}? Each gets an email, and a ticket opens in the desk so replies come back here.`)) {
      return;
    }
    setBusy("send");
    setError(null);
    startTransition(async () => {
      const result = await send(incidentId, message);
      if (result.ok) {
        // Re-render the page into its sent / sending-progress state.
        router.refresh();
      } else {
        setError(result.error);
        setBusy(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-3">Message to clients</span>
        <button
          type="button"
          onClick={onRedraft}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-accent-200 bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700 transition hover:bg-accent-100 disabled:opacity-50 dark:border-accent-500/25 dark:bg-accent-500/10 dark:text-accent-300 dark:hover:bg-accent-500/20"
        >
          {busy === "draft" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          {busy === "draft" ? "Drafting…" : "Re-draft with AI"}
        </button>
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={12}
        placeholder="Write or re-draft the outreach message…"
        className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink focus:border-ink-3 focus:outline-none"
      />
      <p className="text-[11px] text-ink-3">
        Keep <code className="rounded bg-surface-2 px-1 font-mono">{"{{name}}"}</code> in the greeting — it’s swapped for each
        client’s first name when it sends.
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onSend}
        disabled={isPending || !message.trim()}
        className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-400"
      >
        {busy === "send" ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Send className="h-4 w-4" strokeWidth={1.75} />
        )}
        {busy === "send" ? "Sending…" : `Send to ${recipientCount} client${plural}`}
      </button>
    </div>
  );
}
