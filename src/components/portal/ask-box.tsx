"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Loader2, Sparkles } from "lucide-react";
import { askAction } from "@/app/(client)/actions";

type Result = Awaited<ReturnType<typeof askAction>>;

// Realistic starter questions for Travelgenix's travel-agent clients — clicking
// one asks it straight away.
const SUGGESTIONS = [
  "How do I add a booking widget to my site?",
  "My deeplink isn't working",
  "A supplier isn't returning results",
  "Change my widget colours",
];

export function AskBox() {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setResult(null);
    setAsked(trimmed);
    setQ(trimmed);
    try {
      setResult(await askAction(trimmed));
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
    `/new?subject=${encodeURIComponent(asked.slice(0, 180))}` +
    `&body=${encodeURIComponent(
      `I asked the assistant: "${asked}"\n\nIts answer:\n${result?.answer ?? ""}\n\nThis didn't fully solve it — here's what I still need:\n`,
    )}`;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-[0_20px_45px_-22px_rgba(27,43,91,0.5)] sm:p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent-500" strokeWidth={1.75} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Ask the support assistant a question"
            placeholder="Ask anything — e.g. how do I add a booking widget?"
            className="w-full rounded-xl border border-line bg-canvas py-3 pl-10 pr-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 active:translate-y-px disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={2} />
          ) : (
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          )}
          <span className="hidden sm:inline">{loading ? "Asking" : "Ask"}</span>
        </button>
      </form>

      {!result && !loading && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => run(s)}
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 transition hover:border-accent-300 hover:text-ink active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="mt-4 space-y-2.5 border-t border-line-soft pt-4" aria-live="polite">
          <p className="text-xs font-medium text-accent-700 dark:text-accent-300">Searching your knowledge base…</p>
          <div className="tg-shimmer h-3 w-5/6 rounded bg-surface-2" />
          <div className="tg-shimmer h-3 w-full rounded bg-surface-2" />
          <div className="tg-shimmer h-3 w-2/3 rounded bg-surface-2" />
        </div>
      )}

      {result && !loading && (
        <div className="mt-4 border-t border-line-soft pt-4">
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="max-w-[65ch] whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{result.answer}</p>
              {result.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.sources.map((s) => (
                    <a
                      key={s.url}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-accent-700 transition hover:border-accent-300 dark:text-accent-300"
                    >
                      <span className="truncate">{s.title}</span>
                      <ArrowUpRight className="h-3 w-3 shrink-0" strokeWidth={2} />
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
          </div>
        </div>
      )}
    </div>
  );
}
