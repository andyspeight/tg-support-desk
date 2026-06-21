"use client";
import { useState } from "react";
import Link from "next/link";
import { askAction } from "@/app/portal/actions";

type Result = Awaited<ReturnType<typeof askAction>>;

export function AskBox() {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question || loading) return;
    setLoading(true);
    setResult(null);
    setAsked(question);
    try {
      setResult(await askAction(question));
    } catch {
      setResult({
        answer: "Something went wrong reaching the assistant — please try again, or raise a ticket.",
        sources: [],
      });
    } finally {
      setLoading(false);
    }
  }

  // Smart handoff: carry the question + the assistant's attempt into a new
  // ticket so nothing is retyped and the agent has full context.
  const handoffHref =
    `/portal/new?subject=${encodeURIComponent(asked.slice(0, 180))}` +
    `&body=${encodeURIComponent(
      `I asked the assistant: "${asked}"\n\nIts answer:\n${result?.answer ?? ""}\n\nThis didn't fully solve it — here's what I still need:\n`,
    )}`;

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask a question — e.g. how do I add a booking widget?"
          className="flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="shrink-0 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Asking…" : "Ask"}
        </button>
      </form>

      {result && (
        <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{result.answer}</p>
          {result.sources.length > 0 && (
            <div className="space-y-1">
              {result.sources.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-medium text-accent-700 hover:underline dark:text-accent-300"
                >
                  Read more: {s.title} →
                </a>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-3">
            Didn’t solve it?{" "}
            <Link href={handoffHref} className="font-medium text-brand-600 hover:underline dark:text-brand-300">
              Raise a ticket
            </Link>{" "}
            — we’ll carry over your question.
          </p>
        </div>
      )}
    </div>
  );
}
