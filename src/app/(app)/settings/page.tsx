import { listBlockedSenders, listCannedResponses, listSlaPolicies, listTags } from "@/lib/db/queries";
import {
  addBlockedAction,
  createCannedAction,
  createTagAction,
  deleteCannedAction,
  deleteTagAction,
  removeBlockedAction,
} from "./actions";

function show(value: string | undefined): string {
  return value && value.length > 0 ? value : "not configured";
}

export default async function SettingsPage() {
  const [slaPolicies, canned, tags, blocked] = await Promise.all([
    listSlaPolicies().catch(() => []),
    listCannedResponses().catch(() => []),
    listTags().catch(() => []),
    listBlockedSenders().catch(() => []),
  ]);
  const agents = (process.env.AGENT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Channel, AI and SLA values come from environment configuration. Canned responses and tags are
        editable here.
      </p>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Canned responses</h2>
        <div className="mt-2 space-y-2">
          {canned.length === 0 && <p className="text-sm text-zinc-400">None yet.</p>}
          {canned.map((c) => (
            <div key={c.id} className="flex items-start gap-2 rounded-md border border-zinc-100 p-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-800">{c.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{c.body}</p>
              </div>
              <form action={deleteCannedAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs text-zinc-400 hover:text-red-600">Delete</button>
              </form>
            </div>
          ))}
        </div>
        <form action={createCannedAction} className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
          <input
            name="title"
            required
            placeholder="Title"
            className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
          />
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Response text…"
            className="w-full resize-y rounded-md border border-zinc-200 p-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
          <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Add canned response
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Tags</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.length === 0 && <p className="text-sm text-zinc-400">None yet.</p>}
          {tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
              {t.name}
              <form action={deleteTagAction} className="inline">
                <input type="hidden" name="id" value={t.id} />
                <button className="text-zinc-400 hover:text-red-600" aria-label={`Delete tag ${t.name}`}>
                  ×
                </button>
              </form>
            </span>
          ))}
        </div>
        <form action={createTagAction} className="mt-3 flex gap-2 border-t border-zinc-100 pt-3">
          <input
            name="name"
            required
            placeholder="new-tag-name"
            className="flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
          />
          <input
            name="color"
            placeholder="colour (optional)"
            className="w-32 rounded-md border border-zinc-200 px-2 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
          />
          <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Add
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Agents</h2>
        {agents.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">No agent seats configured (AGENT_EMAILS).</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            {agents.map((email) => (
              <li key={email}>{email}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Blocked senders</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Mail from these is dropped before a ticket is created. Use an exact address or{" "}
          <code className="rounded bg-zinc-100 px-1">@domain.com</code> to block a whole domain.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {blocked.length === 0 && <p className="text-sm text-zinc-400">None.</p>}
          {blocked.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
              {b.pattern}
              <form action={removeBlockedAction} className="inline">
                <input type="hidden" name="id" value={b.id} />
                <button className="text-zinc-400 hover:text-red-600" aria-label={`Unblock ${b.pattern}`}>
                  ×
                </button>
              </form>
            </span>
          ))}
        </div>
        <form action={addBlockedAction} className="mt-3 flex gap-2 border-t border-zinc-100 pt-3">
          <input
            name="pattern"
            required
            placeholder="spammer@example.com or @example.com"
            className="flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
          />
          <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Block
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Email channel</h2>
        <dl className="mt-2 space-y-1 text-sm text-zinc-700">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Support mailbox</dt>
            <dd>{show(process.env.SUPPORT_EMAIL)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">From name</dt>
            <dd>{show(process.env.SUPPORT_FROM_NAME)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Polling</dt>
            <dd>Gmail API, every minute (Vercel cron)</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">AI</h2>
        <dl className="mt-2 space-y-1 text-sm text-zinc-700">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Resolution model</dt>
            <dd>{process.env.RESOLUTION_MODEL ?? "claude-fable-5"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Utility model</dt>
            <dd>{process.env.UTILITY_MODEL ?? "claude-haiku-4-5"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Embeddings</dt>
            <dd>{process.env.EMBEDDING_MODEL ?? "voyage-3.5"} (1024d)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Confidence threshold</dt>
            <dd>{process.env.AI_CONFIDENCE_THRESHOLD ?? "0.55"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">SLA targets</h2>
        {slaPolicies.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">No SLA policies found.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="py-1 font-medium">Policy</th>
                <th className="py-1 font-medium">First response</th>
                <th className="py-1 font-medium">Resolve</th>
              </tr>
            </thead>
            <tbody>
              {slaPolicies.map((policy) => (
                <tr key={policy.id} className="border-t border-zinc-100 text-zinc-700">
                  <td className="py-1.5">{policy.name}</td>
                  <td className="py-1.5">{Math.round(policy.first_response_minutes / 60)}h</td>
                  <td className="py-1.5">{Math.round(policy.resolve_minutes / 60)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-zinc-400">
          Business-hours targets for humans — the AI responds instantly regardless.
        </p>
      </section>
    </div>
  );
}
