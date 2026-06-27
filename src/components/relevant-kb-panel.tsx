"use client";

import { BookOpen, Plus } from "lucide-react";
import { dispatchKbInsert } from "@/lib/kb-links";

export type RelevantKbItem = { id: string; title: string; url: string };

/** Customer-360 side-panel card: published KB articles the AI already surfaced
 *  on this ticket. Title opens the public page (preview before you send); "Insert
 *  link" drops a reference into the reply via the shared KB insert event. */
export function RelevantKbPanel({ articles }: { articles: RelevantKbItem[] }) {
  if (articles.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
        <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} /> Relevant knowledge base
      </h2>
      <ul className="space-y-2">
        {articles.map((a) => (
          <li key={a.id} className="rounded-lg border border-line bg-surface p-3">
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs font-medium text-ink hover:underline"
              title={a.title}
            >
              {a.title}
            </a>
            <button
              type="button"
              onClick={() => dispatchKbInsert({ title: a.title, url: a.url })}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200"
            >
              <Plus className="h-3 w-3" strokeWidth={2} /> Insert link
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
