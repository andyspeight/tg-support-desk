import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Inbox, Star, Users, type LucideIcon } from "lucide-react";
import { getSession } from "@/lib/auth";
import { awaitingResponse, getAgentScorecard, inboxCounts, listBreachingTickets, listTickets } from "@/lib/db/queries";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { RefreshPoller } from "@/components/refresh-poller";

function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour: "numeric", hour12: false }));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function waitingHours(since: string): number {
  return Math.floor((Date.now() - new Date(since).getTime()) / 3_600_000);
}

function Stat({
  label,
  value,
  icon: Icon,
  href,
  tone = "default",
  sub,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "warn" | "danger";
  sub?: string;
}) {
  const border = tone === "danger" ? "border-red-200 dark:border-red-500/30" : tone === "warn" ? "border-amber-200 dark:border-amber-500/30" : "border-line";
  const iconCls = tone === "danger" ? "text-red-500" : tone === "warn" ? "text-amber-500" : "text-ink-3";
  const valCls = tone === "danger" ? "text-red-600 dark:text-red-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-ink";
  const body = (
    <div className={`rounded-lg border bg-surface p-4 ${border} ${href ? "transition hover:border-ink-3" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
        <Icon className={`h-4 w-4 ${iconCls}`} strokeWidth={1.75} />
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valCls}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-3">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function WaitingBadge({ since }: { since: string }) {
  const hrs = waitingHours(since);
  const over = hrs >= 24;
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
        over ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      }`}
      title="Awaiting your reply"
    >
      waiting {hrs < 1 ? "<1" : hrs}h
    </span>
  );
}

export default async function HomePage() {
  const session = (await getSession())!;
  const firstName = session.name?.split(/\s+/)[0] || "there";

  const [counts, myTickets, awaiting, scorecard, breaching] = await Promise.all([
    inboxCounts(session.email),
    listTickets("mine", session.email),
    awaitingResponse().catch(() => []),
    getAgentScorecard(session.email).catch(() => ({ resolvedToday: 0, csatAvg: null, csatCount: 0 })),
    listBreachingTickets().catch(() => []),
  ]);

  const awaitingMap = new Map(awaiting.map((a) => [a.ticketId, a.waitingSince]));
  const waitingOnMe = myTickets.filter((t) => awaitingMap.has(t.id));
  const myBreaching = breaching.filter((t) => t.assignee?.toLowerCase() === session.email.toLowerCase());
  // Surface the tickets needing a reply first, then the rest of my open queue.
  const queue = [...waitingOnMe, ...myTickets.filter((t) => !awaitingMap.has(t.id))].slice(0, 12);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <RefreshPoller intervalMs={30000} />

      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">
          {greeting()}, {firstName}
        </h1>
        <span className="text-xs text-ink-3">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Assigned to me" value={counts.mine} icon={Inbox} href="/inbox?view=mine" />
        <Stat label="Waiting on me" value={waitingOnMe.length} icon={Clock} href="/inbox?view=mine" tone={waitingOnMe.length > 0 ? "warn" : "default"} />
        <Stat label="Breaching (mine)" value={myBreaching.length} icon={AlertTriangle} href="/inbox?view=breaching" tone={myBreaching.length > 0 ? "danger" : "default"} />
        <Stat label="Resolved today" value={scorecard.resolvedToday} icon={CheckCircle2} />
        <Stat
          label="My CSAT"
          value={scorecard.csatAvg === null ? "—" : scorecard.csatAvg.toFixed(1)}
          icon={Star}
          sub={scorecard.csatCount > 0 ? `${scorecard.csatCount} rated` : undefined}
        />
      </div>

      {/* Pick up work */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/inbox?view=unassigned"
          className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-sm transition hover:border-ink-3"
        >
          <span className="flex items-center gap-2 text-ink-2">
            <Users className="h-4 w-4 text-ink-3" strokeWidth={1.75} /> Unassigned — grab one
          </span>
          <span className="font-semibold tabular-nums text-ink">{counts.unassigned}</span>
        </Link>
        <Link
          href="/inbox?view=escalated"
          className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-sm transition hover:border-ink-3"
        >
          <span className="flex items-center gap-2 text-ink-2">
            <AlertTriangle className="h-4 w-4 text-ink-3" strokeWidth={1.75} /> AI-escalated — needs a human
          </span>
          <span className="font-semibold tabular-nums text-ink">{counts.escalated}</span>
        </Link>
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">My queue</h2>
          <Link href="/inbox?view=mine" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
            Open inbox
          </Link>
        </div>

        {queue.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
            <p className="text-sm font-medium text-ink">Nothing assigned to you right now</p>
            <p className="mt-1 text-xs text-ink-3">
              Grab one from{" "}
              <Link href="/inbox?view=unassigned" className="font-medium text-brand-600 dark:text-brand-300">
                Unassigned
              </Link>{" "}
              or pick up an{" "}
              <Link href="/inbox?view=escalated" className="font-medium text-brand-600 dark:text-brand-300">
                AI-escalated
              </Link>{" "}
              ticket.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {queue.map((t) => {
              const since = awaitingMap.get(t.id);
              return (
                <li key={t.id}>
                  <Link
                    href={`/ticket/${t.id}`}
                    className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition hover:border-ink-3"
                  >
                    <span className="w-10 shrink-0 text-xs tabular-nums text-ink-3">#{t.reference}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{t.subject}</span>
                    {since && <WaitingBadge since={since} />}
                    <StatusBadge status={t.status} />
                    <PriorityBadge priority={t.priority} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
