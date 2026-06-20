"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Ticket } from "@/lib/db/types";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type Props = {
  tickets: Ticket[];
  bulkUpdate: (formData: FormData) => Promise<void>;
  awaiting?: Record<string, string>;
  agents?: string[];
};

function waitingHours(since: string): number {
  return Math.floor((Date.now() - new Date(since).getTime()) / 3_600_000);
}

function WaitingBadge({ since }: { since: string }) {
  const hrs = waitingHours(since);
  const over = hrs >= 24;
  return (
    <span
      className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${
        over
          ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      }`}
      title="Awaiting an agent reply"
    >
      waiting {hrs < 1 ? "<1" : hrs}h
    </span>
  );
}

export function InboxTable({ tickets, bulkUpdate, awaiting, agents }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [isPending, startTransition] = useTransition();
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runBulk = useCallback(
    (op: string, value?: string) => {
      const ids = selected.size > 0 ? [...selected] : tickets[focus] ? [tickets[focus].id] : [];
      if (!ids.length) return;
      const fd = new FormData();
      fd.set("ids", ids.join(","));
      fd.set("op", op);
      if (value) fd.set("value", value);
      startTransition(async () => {
        await bulkUpdate(fd);
        setSelected(new Set());
      });
    },
    [selected, tickets, focus, bulkUpdate],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (!tickets.length) return;

      switch (e.key) {
        case "j":
          e.preventDefault();
          setFocus((f) => Math.min(f + 1, tickets.length - 1));
          break;
        case "k":
          e.preventDefault();
          setFocus((f) => Math.max(f - 1, 0));
          break;
        case "x":
          e.preventDefault();
          if (tickets[focus]) toggle(tickets[focus].id);
          break;
        case "Enter":
          e.preventDefault();
          if (tickets[focus]) router.push(`/ticket/${tickets[focus].id}`);
          break;
        case "a":
          e.preventDefault();
          runBulk("assign_me");
          break;
        case "r":
          e.preventDefault();
          runBulk("status", "resolved");
          break;
        case "e":
          e.preventDefault();
          runBulk("status", "escalated");
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tickets, focus, toggle, runBulk, router]);

  useEffect(() => {
    rowRefs.current[focus]?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  if (tickets.length === 0) {
    return <p className="mt-10 text-center text-sm text-ink-3">No tickets in this view.</p>;
  }

  const count = selected.size;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 border-b border-line-soft py-2 text-xs text-ink-2">
        {count > 0 ? (
          <>
            <span className="font-medium text-ink">{count} selected</span>
            <button onClick={() => runBulk("assign_me")} disabled={isPending} className="rounded border border-line bg-surface px-2 py-1 hover:bg-surface-2">
              Assign to me
            </button>
            {agents && agents.length > 0 && (
              <select
                defaultValue=""
                disabled={isPending}
                onChange={(e) => {
                  if (e.target.value) {
                    runBulk("assign", e.target.value);
                    e.target.value = "";
                  }
                }}
                className="rounded border border-line bg-surface px-2 py-1 text-xs"
                aria-label="Assign to teammate"
              >
                <option value="" disabled>
                  Assign to…
                </option>
                {agents.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
            <button onClick={() => runBulk("status", "resolved")} disabled={isPending} className="rounded border border-line bg-surface px-2 py-1 hover:bg-surface-2">
              Resolve
            </button>
            <button onClick={() => runBulk("status", "escalated")} disabled={isPending} className="rounded border border-line bg-surface px-2 py-1 hover:bg-surface-2">
              Escalate
            </button>
            <button onClick={() => runBulk("status", "closed")} disabled={isPending} className="rounded border border-line bg-surface px-2 py-1 hover:bg-surface-2">
              Close
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-ink-3 hover:text-ink">
              Clear
            </button>
          </>
        ) : (
          <span className="text-ink-3">
            Keyboard: <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>x</kbd> select · <kbd>↵</kbd> open · <kbd>a</kbd> assign me ·{" "}
            <kbd>r</kbd> resolve · <kbd>e</kbd> escalate
          </span>
        )}
      </div>

      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-3">
            <th className="w-8 py-2"></th>
            <th className="w-14 py-2 font-medium">#</th>
            <th className="py-2 font-medium">Subject</th>
            <th className="w-44 py-2 font-medium">Requester</th>
            <th className="w-36 py-2 font-medium">Status</th>
            <th className="w-12 py-2 font-medium">Pri</th>
            <th className="w-32 py-2 font-medium">Assignee</th>
            <th className="w-20 py-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket, i) => (
            <tr
              key={ticket.id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              onClick={() => setFocus(i)}
              className={`border-t border-line-soft ${i === focus ? "bg-brand-50/70 dark:bg-brand-500/15" : "hover:bg-surface-2"} ${
                selected.has(ticket.id) ? "bg-brand-50 dark:bg-brand-500/15" : ""
              }`}
            >
              <td className="py-2.5 pl-1">
                <input
                  type="checkbox"
                  checked={selected.has(ticket.id)}
                  onChange={() => toggle(ticket.id)}
                  aria-label={`Select ticket ${ticket.reference}`}
                />
              </td>
              <td className="py-2.5 text-ink-3">#{ticket.reference}</td>
              <td className="truncate py-2.5 pr-4">
                <Link href={`/ticket/${ticket.id}`} className="font-medium text-ink hover:underline">
                  {ticket.subject}
                </Link>
                {ticket.ai_resolved && (
                  <span className="ml-2 rounded bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-700 dark:bg-accent-500/10 dark:text-accent-300">AI</span>
                )}
                {awaiting?.[ticket.id] && <WaitingBadge since={awaiting[ticket.id]} />}
              </td>
              <td className="truncate py-2.5 text-ink-2">{ticket.requester_name ?? ticket.requester_email}</td>
              <td className="py-2.5">
                <StatusBadge status={ticket.status} />
              </td>
              <td className="py-2.5">
                <PriorityBadge priority={ticket.priority} />
              </td>
              <td className="truncate py-2.5 text-ink-2">{ticket.assignee ?? "—"}</td>
              <td className="py-2.5 text-ink-3">{timeAgo(ticket.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
