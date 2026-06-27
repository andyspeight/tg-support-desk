"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { dispatchKbInsert } from "@/lib/kb-links";

export type KbPickerItem = { id: string; title: string; url: string };

/** "Link KB article" control for the reply box: search published articles and
 *  drop a link into the reply. Inserts via the shared KB insert event, so the
 *  ReplyBox handles the actual editor write (same path as the side-panel). */
export function KbPicker({ articles }: { articles: KbPickerItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const n = query.trim().toLowerCase();
    const list = n ? articles.filter((a) => a.title.toLowerCase().includes(n)) : articles;
    return list.slice(0, 40);
  }, [query, articles]);

  if (articles.length === 0) return null;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-2 hover:bg-surface-2"
      >
        <BookOpen className="h-4 w-4" strokeWidth={1.75} /> Link KB
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-72 overflow-hidden rounded-md border border-line bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-line-soft px-2.5 py-2">
            <Search className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.75} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search articles…"
              autoFocus
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-ink-3">No matching articles.</li>
            ) : (
              filtered.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      dispatchKbInsert({ title: a.title, url: a.url });
                      setOpen(false);
                      setQuery("");
                    }}
                    className="block w-full truncate px-3 py-1.5 text-left text-sm text-ink hover:bg-surface-2"
                    title={a.title}
                  >
                    {a.title}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
