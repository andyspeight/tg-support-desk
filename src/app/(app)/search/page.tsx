import Link from "next/link";
import { searchAll } from "@/lib/db/queries";
import { StatusBadge } from "@/components/status-badge";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query ? await searchAll(query).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-lg font-semibold">Search</h1>

      <form method="get" className="mt-3">
        <input
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Search tickets, messages, knowledge base… (or #123 for a ticket number)"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
        />
      </form>

      {results === null && query && (
        <p className="mt-6 text-sm text-ink-3">Search is unavailable right now.</p>
      )}

      {results && (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Tickets ({results.tickets.length})
            </h2>
            <div className="mt-2 space-y-1">
              {results.tickets.length === 0 && <p className="text-sm text-ink-3">No matching tickets.</p>}
              {results.tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/ticket/${t.id}`}
                  className="flex items-center gap-2 rounded-md border border-line-soft bg-surface p-2.5 text-sm hover:border-ink-3"
                >
                  <span className="shrink-0 text-ink-3">#{t.reference}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.subject}</span>
                  <span className="hidden max-w-[12rem] shrink-0 truncate text-xs text-ink-3 sm:inline">{t.requester_email}</span>
                  <StatusBadge status={t.status} />
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              In conversations ({results.messages.length})
            </h2>
            <div className="mt-2 space-y-1">
              {results.messages.length === 0 && <p className="text-sm text-ink-3">No matching messages.</p>}
              {results.messages.map((m, i) => (
                <Link
                  key={`${m.ticketId}-${i}`}
                  href={`/ticket/${m.ticketId}`}
                  className="block rounded-md border border-line-soft bg-surface p-2.5 text-sm hover:border-ink-3"
                >
                  <span className="text-xs text-ink-3">
                    #{m.reference} · {m.subject}
                  </span>
                  <p className="mt-0.5 line-clamp-2 text-ink-2">{m.snippet}</p>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Knowledge base ({results.kb.length})
            </h2>
            <div className="mt-2 space-y-1">
              {results.kb.length === 0 && <p className="text-sm text-ink-3">No matching articles.</p>}
              {results.kb.map((a) => (
                <Link
                  key={a.id}
                  href={`/kb?status=${a.status}&id=${a.id}`}
                  className="flex items-center gap-2 rounded-md border border-line-soft bg-surface p-2.5 text-sm hover:border-ink-3"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{a.title}</span>
                  <span className="text-xs text-ink-3">{a.status}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
