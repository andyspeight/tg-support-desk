import Link from "next/link";
import { requireClient } from "@/lib/auth";
import { listRequesterTickets } from "@/lib/db/queries";
import { AskBox } from "@/components/portal/ask-box";
import { clientStatus } from "@/lib/portal-status";

export default async function PortalHome() {
  const session = await requireClient();
  const tickets = await listRequesterTickets(session.email);
  const firstName = session.name?.split(/\s+/)[0] || "there";

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold">Hi {firstName}, how can we help?</h1>
        <p className="mt-1 text-sm text-ink-2">
          Ask a question for an instant answer, or raise a ticket and the team will pick it up.
        </p>
        <div className="mt-4">
          <AskBox />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your tickets</h2>
          <Link href="/portal/new" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
            Raise a ticket
          </Link>
        </div>

        {tickets.length === 0 ? (
          <p className="mt-3 rounded-lg border border-line-soft bg-surface px-4 py-6 text-center text-sm text-ink-3">
            You have no tickets yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tickets.map((t) => {
              const s = clientStatus(t.status);
              return (
                <li key={t.id}>
                  <Link
                    href={`/portal/ticket/${t.id}`}
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
