import { getSession } from "@/lib/auth";
import { listNotifications } from "@/lib/db/notifications";
import { RefreshPoller } from "@/components/refresh-poller";
import { CheckCheck } from "lucide-react";
import { markAllReadAction, openNotificationAction } from "./actions";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  assigned: "Assigned",
  customer_reply: "Customer reply",
  escalated: "Escalated",
  mention: "Mention",
  stale: "Awaiting reply",
  snooze_due: "Snooze ended",
};

const TYPE_DOT: Record<string, string> = {
  assigned: "bg-brand-500",
  customer_reply: "bg-accent-500",
  escalated: "bg-red-500",
  mention: "bg-sky-500",
  stale: "bg-amber-500",
  snooze_due: "bg-emerald-500",
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function NotificationsPage() {
  const session = (await getSession())!;
  const items = await listNotifications(session.email, 100).catch(() => []);
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <RefreshPoller />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Notifications {unread > 0 && <span className="text-sm font-normal text-ink-3">· {unread} unread</span>}
        </h1>
        {unread > 0 && (
          <form action={markAllReadAction}>
            <button className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2">
              <CheckCheck className="h-4 w-4" strokeWidth={1.75} />
              Mark all read
            </button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-3">You&apos;re all caught up — no notifications.</p>
      ) : (
        <div className="mt-4 divide-y divide-line-soft overflow-hidden rounded-lg border border-line bg-surface">
          {items.map((n) => (
            <form key={n.id} action={openNotificationAction}>
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="ticketId" value={n.ticket_id ?? ""} />
              <button
                type="submit"
                className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2 ${n.read_at ? "" : "bg-brand-50/40 dark:bg-brand-500/10"}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : TYPE_DOT[n.type] ?? "bg-ink-3"}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-sm ${n.read_at ? "text-ink-2" : "font-medium text-ink"}`}>{n.title}</span>
                  </span>
                  {n.body && <span className="mt-0.5 block truncate text-xs text-ink-3">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-ink-3">
                    {TYPE_LABEL[n.type] ?? n.type} · {timeAgo(n.created_at)}
                  </span>
                </span>
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
