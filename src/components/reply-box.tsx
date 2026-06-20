"use client";

import { useState, useTransition } from "react";

type CannedOption = { id: string; title: string; body: string };
type CopilotResult = { ok: true; text: string } | { ok: false; error: string };

type Props = {
  ticketId: string;
  canned: CannedOption[];
  sendReply: (formData: FormData) => Promise<void>;
  addNote: (formData: FormData) => Promise<void>;
  copilot?: {
    draft: (ticketId: string) => Promise<CopilotResult>;
    summarise: (ticketId: string) => Promise<CopilotResult>;
    rephrase: (text: string) => Promise<CopilotResult>;
    translate: (text: string, language: string) => Promise<CopilotResult>;
  };
};

export function ReplyBox({ ticketId, canned, sendReply, addNote, copilot }: Props) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (action: (formData: FormData) => Promise<void>) => {
    if (!body.trim() || isPending) return;
    const formData = new FormData();
    formData.set("ticketId", ticketId);
    formData.set("body", body);
    startTransition(async () => {
      await action(formData);
      setBody("");
    });
  };

  const runCopilot = (label: string, fn: () => Promise<CopilotResult>, apply: (text: string) => void) => {
    if (busy) return;
    setBusy(label);
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) apply(result.text);
      else setError(result.error);
      setBusy(null);
    });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
      {copilot && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-accent-700">Copilot</span>
          <button
            onClick={() => runCopilot("draft", () => copilot.draft(ticketId), setBody)}
            disabled={!!busy || isPending}
            className="rounded border border-accent-200 bg-accent-50 px-2 py-1 text-accent-700 hover:bg-accent-100 disabled:opacity-40"
          >
            {busy === "draft" ? "Drafting…" : "Draft reply"}
          </button>
          <button
            onClick={() => runCopilot("summary", () => copilot.summarise(ticketId), setSummary)}
            disabled={!!busy || isPending}
            className="rounded border border-zinc-200 px-2 py-1 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          >
            {busy === "summary" ? "Summarising…" : "Summarise"}
          </button>
          <button
            onClick={() => body.trim() && runCopilot("rephrase", () => copilot.rephrase(body), setBody)}
            disabled={!!busy || isPending || !body.trim()}
            className="rounded border border-zinc-200 px-2 py-1 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          >
            {busy === "rephrase" ? "Rephrasing…" : "Rephrase"}
          </button>
          <button
            onClick={() => {
              const lang = window.prompt("Translate the draft into which language?", "French");
              if (lang && body.trim()) runCopilot("translate", () => copilot.translate(body, lang), setBody);
            }}
            disabled={!!busy || isPending || !body.trim()}
            className="rounded border border-zinc-200 px-2 py-1 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          >
            Translate
          </button>
        </div>
      )}

      {summary && (
        <div className="mb-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-zinc-500">Thread summary</span>
            <button onClick={() => setSummary(null)} className="text-zinc-400 hover:text-zinc-700">
              dismiss
            </button>
          </div>
          {summary}
        </div>
      )}

      {error && <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="Write a reply… (sent by email) or an internal note"
        className="w-full resize-y rounded-md border border-zinc-200 p-2 text-sm focus:border-zinc-400 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => submit(sendReply)}
          disabled={isPending || !body.trim()}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
        >
          {isPending ? "Working…" : "Reply to customer"}
        </button>
        <button
          onClick={() => submit(addNote)}
          disabled={isPending || !body.trim()}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
        >
          Internal note
        </button>
        {canned.length > 0 && (
          <select
            className="ml-auto rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-600"
            value=""
            onChange={(e) => {
              const found = canned.find((c) => c.id === e.target.value);
              if (found) setBody((current) => (current ? `${current}\n\n${found.body}` : found.body));
            }}
          >
            <option value="" disabled>
              Canned responses…
            </option>
            {canned.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
