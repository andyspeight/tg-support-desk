import Link from "next/link";
import { ArrowLeft, ChevronRight, Inbox, Plus } from "lucide-react";
import { resolvePortalView } from "@/lib/auth";
import { listRequesterTickets } from "@/lib/db/queries";
import { AskBox } from "@/components/portal/ask-box";
import { clientStatus } from "@/lib/portal-status";

const OPEN_STATUSES = new Set(["new", "ai_working", "waiting_on_customer", "escalated"]);

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent && value > 0 ? "text-amber-600 dark:text-amber-400" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ as?: string; from?: string }> }) {
  const { as, from } = await searchParams;
  const view = await resolvePortalView(as);
  const tickets = await listRequesterTickets(view.email);
  const firstName = view.name?.split(/\s+/)[0] || "there";
  const fromParam = from && view.previewing ? `&from=${encodeURIComponent(from)}` : "";
  const suffix = view.previewing ? `?as=${encodeURIComponent(view.email)}${fromParam}` : "";
  const deskHref = from ? `/ticket/${from}` : "/inbox";

  const open = tickets.filter((t) => OPEN_STATUSES.has(t.status)).length;
  const awaiting = tickets.filter((t) => t.status === "waiting_on_customer").length;
  const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;

  return (
    <div className="space-y-8 sm:space-y-10">
      {view.isAgent && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
          <span>
            {view.previewing ? (
              <>
                <span className="font-medium">Agent preview.</span> The support portal as{" "}
                <span className="font-medium">{view.email}</span> sees it — read-only.
              </>
            ) : (
              <>
                <span className="font-medium">Support desk.</span> You’re viewing the client support portal.
              </>
            )}
          </span>
          <Link
            href={deskHref}
            className="inline-flex shrink-0 items-center gap-1 font-medium text-amber-900 underline-offset-2 hover:underline dark:text-amber-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} /> Back to the support desk
          </Link>
        </div>
      )}

      {/* Hero — the AI-first welcome + instant-answer box. */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-700 px-6 py-10 text-white shadow-[0_30px_60px_-30px_rgba(27,43,91,0.6)] sm:px-10 sm:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800" />
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent-500/20 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
            </span>
            AI assistant online · instant answers
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
            {view.previewing ? "How can we help?" : `Hi ${firstName}, how can we help?`}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
            Ask anything about your Travelgenix setup — widgets, deeplinks, suppliers — and get an instant answer.
            Still stuck? Raise a ticket and our team picks it up.
          </p>
          <div className="mt-6">
            <AskBox />
          </div>
        </div>
      </section>

      {/* At-a-glance — divided row, not a stack of cards. */}
      {tickets.length > 0 && (
        <section className="grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface">
          <Stat label="Open" value={open} />
          <Stat label="Awaiting reply" value={awaiting} accent />
          <Stat label="Resolved" value={resolved} />
        </section>
      )}

      {/* Tickets */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{view.previewing ? "Their tickets" : "Your tickets"}</h2>
          {!view.previewing && (
            <Link
              href="/portal/new"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Raise a ticket
            </Link>
          )}
        </div>

        {tickets.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-50 dark:bg-accent-500/10">
              <Inbox className="h-6 w-6 text-accent-600 dark:text-accent-300" strokeWidth={1.5} />
            </div>
            <p className="mt-3 text-sm font-medium text-ink">
              {view.previewing ? "No tickets yet" : "You’re all caught up"}
            </p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink-3">
              {view.previewing
                ? "This client hasn’t raised anything yet."
                : "Ask the assistant above for an instant answer, or raise a ticket and we’ll take it from there."}
            </p>
            {!view.previewing && (
              <Link
                href="/portal/new"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand-700 active:translate-y-px"
              >
                <Plus className="h-4 w-4" strokeWidth={2} /> Raise a ticket
              </Link>
            )}
          </div>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {tickets.map((t, i) => {
              const s = clientStatus(t.status);
              return (
                <li key={t.id} className="tg-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
                  <Link
                    href={`/portal/ticket/${t.id}${suffix}`}
                    className="group flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-ink-3 hover:shadow-[0_16px_30px_-18px_rgba(27,43,91,0.25)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{t.subject}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-ink-3">
                        #{t.reference} · updated{" "}
                        {new Date(t.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${s.tone}`}>{s.label}</span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={1.75}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
