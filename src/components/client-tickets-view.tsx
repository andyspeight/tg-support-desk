"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Ticket } from "@/lib/db/types";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";

type Sort = "updated" | "created" | "status" | "priority";

const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ClientTicketsView({ tickets }: { tickets: Ticket[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("updated");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? tickets.filter((t) =>
          [t.subject, `#${t.reference}`, t.requester_email, t.requester_name ?? "", t.status, t.tags.join(" ")]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        )
      : tickets;
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "created":
          return b.created_at.localeCompare(a.created_at);
        case "status":
          return a.status.localeCompare(b.status);
        case "priority":
          return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
        default:
          return b.updated_at.localeCompare(a.updated_at);
      }
    });
  }, [tickets, query, sort]);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search these tickets…"
            className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort tickets"
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink-2 focus:border-ink-3 focus:outline-none"
        >
          <option value="updated">Last updated</option>
          <option value="created">Newest</option>
          <option value="status">Status</option>
          <option value="priority">Priority</option>
        </select>
        <span className="text-xs text-ink-3">
          {rows.length} of {tickets.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-3">No tickets match.</p>
      ) : (
        <>
        {/* Mobile (<sm): a tappable stacked list; the table takes over from sm up. */}
        <ul className="mt-2 divide-y divide-line-soft sm:hidden">
          {rows.map((t) => (
            <li key={t.id}>
              <Link href={`/staff/ticket/${t.id}`} className="flex items-start gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{t.subject}</span>
                    {t.ai_resolved && (
                      <span className="shrink-0 rounded bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-700 dark:bg-accent-500/10 dark:text-accent-300">
                        AI
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                    <span className="tabular-nums">#{t.reference}</span>
                    <span>{formatDate(t.updated_at)}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <table className="mt-2 hidden w-full table-fixed text-sm sm:table">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-3">
              <th className="hidden w-14 py-2 font-medium sm:table-cell">#</th>
              <th className="py-2 font-medium">Subject</th>
              <th className="w-32 py-2 font-medium sm:w-36">Status</th>
              <th className="hidden w-12 py-2 font-medium sm:table-cell">Pri</th>
              <th className="hidden w-28 py-2 font-medium sm:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-line-soft hover:bg-surface-2">
                <td className="hidden py-2.5 text-ink-3 sm:table-cell">#{t.reference}</td>
                <td className="truncate py-2.5 pr-4">
                  <Link href={`/staff/ticket/${t.id}`} className="font-medium text-ink hover:underline">
                    {t.subject}
                  </Link>
                  {t.ai_resolved && (
                    <span className="ml-2 rounded bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-700 dark:bg-accent-500/10 dark:text-accent-300">
                      AI
                    </span>
                  )}
                </td>
                <td className="py-2.5">
                  <StatusBadge status={t.status} />
                </td>
                <td className="hidden py-2.5 sm:table-cell">
                  <PriorityBadge priority={t.priority} />
                </td>
                <td className="hidden py-2.5 text-ink-3 sm:table-cell">{formatDate(t.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </div>
  );
}
