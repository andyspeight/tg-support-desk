"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Search as SearchIcon } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { splitHighlight, sinceForRange, type DateRange } from "@/lib/search-highlight";
import type { SearchResponse, TicketSearchFilters, TicketStatus } from "@/lib/db/types";

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "ai_working", label: "AI working" },
  { value: "needs_review", label: "Needs review" },
  { value: "waiting_on_customer", label: "Waiting" },
  { value: "escalated", label: "Escalated" },
  { value: "pending", label: "Pending" },
  { value: "awaiting_supplier", label: "Awaiting supplier" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function Highlighted({ text }: { text: string }) {
  return (
    <>
      {splitHighlight(text).map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="rounded bg-amber-200/70 px-0.5 text-ink dark:bg-amber-400/25 dark:text-ink">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

type Props = {
  search: (query: string, filters: TicketSearchFilters) => Promise<SearchResponse>;
  agents: string[];
  initialQuery?: string;
};

export function SearchClient({ search, agents, initialQuery = "" }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [assignee, setAssignee] = useState("");
  const [range, setRange] = useState<DateRange>("any");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isPending, startTransition] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    // Below the min length there's nothing to fetch; the render guards on the
    // query length, so stale results stay hidden without a setState here.
    if (q.length < 2) return;
    const filters: TicketSearchFilters = { statuses, assignee: assignee || null, since: sinceForRange(range, Date.now()) };
    const id = ++seq.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await search(q, filters);
        if (id === seq.current) setResults(res); // ignore out-of-order responses
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, statuses, assignee, range, search]);

  function toggleStatus(value: string) {
    setResults(null);
    setStatuses((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]));
  }

  const trimmed = query.trim();

  return (
    <div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" strokeWidth={1.75} />
        <input
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            if (value.trim().length < 2) setResults(null);
          }}
          autoFocus
          placeholder="Search tickets, conversations and the knowledge base…"
          className="w-full rounded-md border border-line bg-surface py-2.5 pl-9 pr-9 text-sm text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
        />
        {isPending && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-3 motion-reduce:animate-none" />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => toggleStatus(option.value)}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              statuses.includes(option.value)
                ? "border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
                : "border-line text-ink-2 hover:bg-surface-2"
            }`}
          >
            {option.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {agents.length > 0 && (
          <select
            value={assignee}
            onChange={(e) => {
              setResults(null);
              setAssignee(e.target.value);
            }}
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2"
            aria-label="Filter by assignee"
          >
            <option value="">Any assignee</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a.split("@")[0]}
              </option>
            ))}
          </select>
        )}
        <select
          value={range}
          onChange={(e) => {
            setResults(null);
            setRange(e.target.value as DateRange);
          }}
          className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2"
          aria-label="Filter by date"
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {trimmed.length < 2 ? (
        <p className="mt-10 text-center text-sm text-ink-3">
          Start typing to search tickets, conversations and the knowledge base.
        </p>
      ) : !results ? (
        <p className="mt-6 text-sm text-ink-3">Searching…</p>
      ) : (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Tickets ({results.tickets.length})</h2>
            <div className="mt-2 space-y-1.5">
              {results.tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/staff/ticket/${ticket.id}`}
                  className="block rounded-md border border-line-soft bg-surface p-3 transition hover:border-ink-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-ink-3">#{ticket.reference}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{ticket.subject}</span>
                    <StatusBadge status={ticket.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">
                    <Highlighted text={ticket.snippet} />
                  </p>
                  <p className="mt-1 truncate text-[11px] text-ink-3">
                    {ticket.requester_name ? `${ticket.requester_name} · ` : ""}
                    {ticket.requester_email}
                  </p>
                </Link>
              ))}
              {results.tickets.length === 0 && <p className="text-sm text-ink-3">No matching tickets.</p>}
            </div>
          </section>

          {results.pastTickets.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                Similar past tickets ({results.pastTickets.length})
              </h2>
              <div className="mt-2 space-y-1.5">
                {results.pastTickets.map((pastTicket) => (
                  <Link
                    key={pastTicket.ticket_id}
                    href={`/staff/ticket/${pastTicket.ticket_id}`}
                    className="flex items-center gap-2 rounded-md border border-line-soft bg-surface p-3 transition hover:border-ink-3"
                  >
                    <span className="shrink-0 text-xs text-ink-3">#{pastTicket.reference}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{pastTicket.subject}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">{Math.round(pastTicket.similarity * 100)}% match</span>
                    <StatusBadge status={pastTicket.status} />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Knowledge base ({results.kb.length})
            </h2>
            <div className="mt-2 space-y-1.5">
              {results.kb.map((article) => (
                <div key={article.id} className="rounded-md border border-line-soft bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <Link href={`/staff/kb?id=${article.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:underline">
                      {article.title}
                    </Link>
                    {article.url && (
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-ink-3 hover:text-ink"
                        aria-label="Open source article"
                      >
                        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </a>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">{article.snippet}</p>
                </div>
              ))}
              {results.kb.length === 0 && <p className="text-sm text-ink-3">No matching articles.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
