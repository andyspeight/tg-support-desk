import Link from "next/link";
import { getSession } from "@/lib/auth";
import { inboxCounts, listTickets, type InboxView } from "@/lib/db/queries";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { RefreshPoller } from "@/components/refresh-poller";

const VIEWS: { key: InboxView; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "mine", label: "My open" },
  { key: "unassigned", label: "Unassigned" },
  { key: "escalated", label: "AI-escalated" },
  { key: "waiting", label: "Waiting on customer" },
  { key: "all", label: "All" },
];

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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

      {tickets.length === 0 ? (
        <p className="mt-10 text-center text-sm text-zinc-400">No tickets in this view.</p>
      ) : (
        <table className="mt-2 w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
              <th className="w-16 py-2 font-medium">#</th>
              <th className="py-2 font-medium">Subject</th>
              <th className="w-48 py-2 font-medium">Requester</th>
              <th className="w-40 py-2 font-medium">Status</th>
              <th className="w-16 py-2 font-medium">Pri</th>
              <th className="w-36 py-2 font-medium">Assignee</th>
              <th className="w-24 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="border-t border-zinc-100 hover:bg-white">
                <td className="py-2.5 text-zinc-400">#{ticket.reference}</td>
                <td className="truncate py-2.5 pr-4">
                  <Link href={`/ticket/${ticket.id}`} className="font-medium text-zinc-900 hover:underline">
                    {ticket.subject}
                  </Link>
                  {ticket.ai_resolved && <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">AI resolved</span>}
                </td>
                <td className="truncate py-2.5 text-zinc-500">{ticket.requester_name ?? ticket.requester_email}</td>
                <td className="py-2.5">
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="py-2.5">
                  <PriorityBadge priority={ticket.priority} />
                </td>
                <td className="truncate py-2.5 text-zinc-500">{ticket.assignee ?? "—"}</td>
                <td className="py-2.5 text-zinc-400">{timeAgo(ticket.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
