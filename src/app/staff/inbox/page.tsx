import Link from "next/link";
import { getSession } from "@/lib/auth";
import { awaitingResponse, getTrendSnapshot, inboxCounts, listTickets, type InboxView } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { RefreshPoller } from "@/components/refresh-poller";
import { InboxTable } from "@/components/inbox-table";
import { TrendsBanner } from "@/components/trends-banner";
import { bulkUpdateTicketsAction } from "./actions";

const VIEWS: { key: InboxView; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "mine", label: "My open" },
  { key: "unassigned", label: "Unassigned" },
  { key: "review", label: "Needs review" },
  { key: "escalated", label: "AI-escalated" },
  { key: "waiting", label: "Waiting on customer" },
  { key: "breaching", label: "Breaching SLA" },
  { key: "approval", label: "Pending approval" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = (await getSession())!;
  const { view: rawView } = await searchParams;
  const view: InboxView = VIEWS.some((v) => v.key === rawView) ? (rawView as InboxView) : "open";

  const [tickets, counts, awaiting, trends] = await Promise.all([
    listTickets(view, session.email),
    inboxCounts(session.email),
    awaitingResponse().catch(() => []),
    getTrendSnapshot().catch(() => null),
  ]);
  const awaitingMap: Record<string, string> = {};
  for (const a of awaiting) awaitingMap[a.ticketId] = a.waitingSince;

  const clusters = trends?.payload.clusters ?? [];

  return (
    <div className="p-4 sm:p-6">
      <RefreshPoller />
      {trends?.payload.computed && clusters.length > 0 && (
        <TrendsBanner
          computedAt={trends.payload.computedAt}
          clusters={clusters.map((c) => ({ key: c.key, label: c.label, count: c.count, emerging: c.emerging }))}
        />
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Inbox</h1>
      </div>

      {/* Scrolls sideways on mobile so all views stay reachable without wrapping. */}
      <div className="no-scrollbar mt-4 flex gap-1 overflow-x-auto border-b border-line">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/staff/inbox?view=${v.key}`}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
              v.key === view
                ? "border-ink font-medium text-ink"
                : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {v.label}
            <span className="ml-1.5 text-xs text-ink-3">{counts[v.key]}</span>
          </Link>
        ))}
      </div>

      <InboxTable tickets={tickets} bulkUpdate={bulkUpdateTicketsAction} awaiting={awaitingMap} agents={env.agentEmails} />
    </div>
  );
}
