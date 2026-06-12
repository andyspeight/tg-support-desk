import { listSlaPolicies } from "@/lib/db/queries";

function show(value: string | undefined): string {
  return value && value.length > 0 ? value : "not configured";
}

export default async function SettingsPage() {
  const slaPolicies = await listSlaPolicies().catch(() => []);
  const agents = (process.env.AGENT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Read-only in Phase 1 — values come from environment configuration. Editable settings arrive in
        Phase 2 alongside the multi-tenant surface.
      </p>

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
