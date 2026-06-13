import Link from "next/link";
import { getSession } from "@/lib/auth";
import { inboxCounts, listTickets, type InboxView } from "@/lib/db/queries";
import { RefreshPoller } from "@/components/refresh-poller";
import { InboxTable } from "@/components/inbox-table";
import { bulkUpdateTicketsAction } from "./actions";

const VIEWS: { key: InboxView; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "mine", label: "My open" },
  { key: "unassigned", label: "Unassigned" },
  { key: "escalated", label: "AI-escalated" },
  { key: "waiting", label: "Waiting on customer" },
  { key: "breaching", label: "Breaching SLA" },
  { key: "all", label: "All" },
];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = (await getSession())!;
  const { view: rawView } = await searchParams;
  const view: InboxView = VIEWS.some((v) => v.key === rawView) ? (rawView as InboxView) : "open";

  const [tickets, counts] = await Promise.all([listTickets(view, session.email), inboxCounts(session.email)]);

  return (
    <div className="p-6">
      <RefreshPoller />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Inbox</h1>
      </div>

      <div className="mt-4 flex gap-1 border-b border-zinc-200">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/inbox?view=${v.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              v.key === view
                ? "border-zinc-900 font-medium text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {v.label}
            <span className="ml-1.5 text-xs text-zinc-400">{counts[v.key]}</span>
          </Link>
        ))}
      </div>

      <InboxTable tickets={tickets} bulkUpdate={bulkUpdateTicketsAction} />
    </div>
  );
}
