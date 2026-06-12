"use client";

import { useState, useTransition } from "react";

type CannedOption = { id: string; title: string; body: string };

type Props = {
  ticketId: string;
  canned: CannedOption[];
  sendReply: (formData: FormData) => Promise<void>;
  addNote: (formData: FormData) => Promise<void>;
};

export function ReplyBox({ ticketId, canned, sendReply, addNote }: Props) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

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

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
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
