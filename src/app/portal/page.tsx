import Link from "next/link";
import { resolvePortalView } from "@/lib/auth";
import { listRequesterTickets } from "@/lib/db/queries";
import { AskBox } from "@/components/portal/ask-box";
import { clientStatus } from "@/lib/portal-status";

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const view = await resolvePortalView(as);
  const tickets = await listRequesterTickets(view.email);
  const firstName = view.name?.split(/\s+/)[0] || "there";
  const suffix = view.previewing ? `?as=${encodeURIComponent(view.email)}` : "";

  return (
    <div className="space-y-8">
      {view.previewing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="font-medium">Agent preview.</span> This is the support portal as{" "}
          <span className="font-medium">{view.email}</span> sees it — read-only, so customer actions are hidden.
        </div>
      )}

      {!view.previewing && (
        <section>
          <h1 className="text-xl font-semibold">Hi {firstName}, how can we help?</h1>
          <p className="mt-1 text-sm text-ink-2">
            Ask a question for an instant answer, or raise a ticket and the team will pick it up.
          </p>
          <div className="mt-4">
            <AskBox />
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{view.previewing ? "Their tickets" : "Your tickets"}</h2>
          {!view.previewing && (
            <Link href="/portal/new" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
              Raise a ticket
            </Link>
          )}
        </div>

        {tickets.length === 0 ? (
          <p className="mt-3 rounded-lg border border-line-soft bg-surface px-4 py-6 text-center text-sm text-ink-3">
            {view.previewing ? "This client has no tickets yet." : "You have no tickets yet."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tickets.map((t) => {
              const s = clientStatus(t.status);
              return (
                <li key={t.id}>
                  <Link
                    href={`/portal/ticket/${t.id}${suffix}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface px-4 py-3 hover:border-ink-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{t.subject}</span>
                      <span className="block text-xs text-ink-3">
                        #{t.reference} · {new Date(t.updated_at).toLocaleDateString("en-GB")}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${s.tone}`}>{s.label}</span>
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
