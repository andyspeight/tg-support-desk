import Link from "next/link";
import { searchAll } from "@/lib/db/queries";
import { StatusBadge } from "@/components/status-badge";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query ? await searchAll(query).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-lg font-semibold">Search</h1>

      <form method="get" className="mt-3">
        <input
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Search tickets, messages, knowledge base… (or #123 for a ticket number)"
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        />
      </form>

      {results === null && query && (
        <p className="mt-6 text-sm text-zinc-400">Search is unavailable right now.</p>
      )}

      {results && (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Tickets ({results.tickets.length})
            </h2>
            <div className="mt-2 space-y-1">
              {results.tickets.length === 0 && <p className="text-sm text-zinc-400">No matching tickets.</p>}
              {results.tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/ticket/${t.id}`}
                  className="flex items-center gap-2 rounded-md border border-zinc-100 bg-white p-2.5 text-sm hover:border-zinc-300"
                >
                  <span className="text-zinc-400">#{t.reference}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{t.subject}</span>
                  <span className="truncate text-xs text-zinc-400">{t.requester_email}</span>
                  <StatusBadge status={t.status} />
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              In conversations ({results.messages.length})
            </h2>
            <div className="mt-2 space-y-1">
              {results.messages.length === 0 && <p className="text-sm text-zinc-400">No matching messages.</p>}
              {results.messages.map((m, i) => (
                <Link
                  key={`${m.ticketId}-${i}`}
                  href={`/ticket/${m.ticketId}`}
                  className="block rounded-md border border-zinc-100 bg-white p-2.5 text-sm hover:border-zinc-300"
                >
                  <span className="text-xs text-zinc-400">
                    #{m.reference} · {m.subject}
                  </span>
                  <p className="mt-0.5 line-clamp-2 text-zinc-600">{m.snippet}</p>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Knowledge base ({results.kb.length})
            </h2>
            <div className="mt-2 space-y-1">
              {results.kb.length === 0 && <p className="text-sm text-zinc-400">No matching articles.</p>}
              {results.kb.map((a) => (
                <Link
                  key={a.id}
                  href={`/kb?status=${a.status}&id=${a.id}`}
                  className="flex items-center gap-2 rounded-md border border-zinc-100 bg-white p-2.5 text-sm hover:border-zinc-300"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{a.title}</span>
                  <span className="text-xs text-zinc-400">{a.status}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
