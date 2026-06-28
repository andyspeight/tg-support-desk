import { X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { listBlockedSenders, listCannedResponses, listSlaPolicies, listTags } from "@/lib/db/queries";
import { GdprPanel } from "@/components/gdpr-panel";
import {
  addBlockedAction,
  createCannedAction,
  createTagAction,
  deleteCannedAction,
  deleteTagAction,
  eraseCustomerDataAction,
  removeBlockedAction,
  updateCannedAction,
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
  const session = await getSession();
  const isOwner = !!session && env.ownerEmails.includes(session.email);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-ink-2">
        Channel, AI and SLA values come from environment configuration. Canned responses and tags are
        editable here.
      </p>

      <section className="mt-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Canned responses</h2>
        <p className="mt-1 text-xs text-ink-3">
          Insert from the reply box. Variables fill in on insert:{" "}
          <code className="rounded bg-surface-2 px-1">{"{{first_name}}"}</code>{" "}
          <code className="rounded bg-surface-2 px-1">{"{{name}}"}</code>{" "}
          <code className="rounded bg-surface-2 px-1">{"{{agent}}"}</code>{" "}
          <code className="rounded bg-surface-2 px-1">{"{{ticket}}"}</code>.
        </p>
        <div className="mt-3 space-y-2">
          {canned.length === 0 && <p className="text-sm text-ink-3">None yet.</p>}
          {canned.map((c) => (
            <form key={c.id} action={updateCannedAction} className="space-y-1.5 rounded-md border border-line-soft p-2">
              <input type="hidden" name="id" value={c.id} />
              <input
                name="title"
                defaultValue={c.title}
                required
                className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm font-medium focus:border-ink-3 focus:outline-none"
              />
              <textarea
                name="body"
                defaultValue={c.body}
                required
                rows={2}
                className="w-full resize-y rounded-md border border-line bg-surface p-2 text-xs text-ink-2 focus:border-ink-3 focus:outline-none"
              />
              <div className="flex gap-2">
                <button className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2">
                  Save
                </button>
                <button
                  formAction={deleteCannedAction}
                  className="rounded-md px-2.5 py-1 text-xs text-ink-3 hover:text-red-600 dark:hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </form>
          ))}
        </div>
        <form action={createCannedAction} className="mt-3 space-y-2 border-t border-line-soft pt-3">
          <input
            name="title"
            required
            placeholder="New canned response title"
            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
          />
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Response text… use {{first_name}}, {{agent}}, {{ticket}}"
            className="w-full resize-y rounded-md border border-line bg-surface p-2 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
          />
          <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-surface-2 dark:text-ink dark:hover:bg-line">
            Add canned response
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Tags</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.length === 0 && <p className="text-sm text-ink-3">None yet.</p>}
          {tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink">
              {t.name}
              <form action={deleteTagAction} className="inline">
                <input type="hidden" name="id" value={t.id} />
                <button className="text-ink-3 hover:text-red-600 dark:hover:text-red-400" aria-label={`Delete tag ${t.name}`}>
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </form>
            </span>
          ))}
        </div>
        <form action={createTagAction} className="mt-3 flex gap-2 border-t border-line-soft pt-3">
          <input
            name="name"
            required
            placeholder="new-tag-name"
            className="flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
          />
          <input
            name="color"
            placeholder="colour (optional)"
            className="w-32 rounded-md border border-line bg-surface px-2 py-1.5 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
          />
          <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-surface-2 dark:text-ink dark:hover:bg-line">
            Add
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Agents</h2>
        {agents.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No agent seats configured (AGENT_EMAILS).</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {agents.map((email) => (
              <li key={email}>{email}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Blocked senders</h2>
        <p className="mt-1 text-xs text-ink-3">
          Mail from these is dropped before a ticket is created. Use an exact address or{" "}
          <code className="rounded bg-surface-2 px-1">@domain.com</code> to block a whole domain.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {blocked.length === 0 && <p className="text-sm text-ink-3">None.</p>}
          {blocked.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink">
              {b.pattern}
              <form action={removeBlockedAction} className="inline">
                <input type="hidden" name="id" value={b.id} />
                <button className="text-ink-3 hover:text-red-600 dark:hover:text-red-400" aria-label={`Unblock ${b.pattern}`}>
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </form>
            </span>
          ))}
        </div>
        <form action={addBlockedAction} className="mt-3 flex gap-2 border-t border-line-soft pt-3">
          <input
            name="pattern"
            required
            placeholder="spammer@example.com or @example.com"
            className="flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
          />
          <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-surface-2 dark:text-ink dark:hover:bg-line">
            Block
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Email channel</h2>
        <dl className="mt-2 space-y-1 text-sm text-ink">
          <div className="flex justify-between">
            <dt className="text-ink-2">Support mailbox</dt>
            <dd>{show(process.env.SUPPORT_EMAIL)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-2">From name</dt>
            <dd>{show(process.env.SUPPORT_FROM_NAME)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-2">Polling</dt>
            <dd>Gmail API, every minute (Vercel cron)</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">AI</h2>
        <dl className="mt-2 space-y-1 text-sm text-ink">
          <div className="flex justify-between">
            <dt className="text-ink-2">Resolution model</dt>
            <dd>{process.env.RESOLUTION_MODEL ?? "claude-fable-5"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-2">Utility model</dt>
            <dd>{process.env.UTILITY_MODEL ?? "claude-haiku-4-5"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-2">Embeddings</dt>
            <dd>{process.env.EMBEDDING_MODEL ?? "voyage-3.5"} (1024d)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-2">Confidence threshold</dt>
            <dd>{process.env.AI_CONFIDENCE_THRESHOLD ?? "0.55"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-2">Shadow mode</dt>
            <dd>{process.env.AI_SHADOW_MODE === "true" ? "on — AI drafts, never sends" : "off"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">SLA targets</h2>
        {slaPolicies.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No SLA policies found.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-3">
                <th className="py-1 font-medium">Policy</th>
                <th className="py-1 font-medium">First response</th>
                <th className="py-1 font-medium">Resolve</th>
              </tr>
            </thead>
            <tbody>
              {slaPolicies.map((policy) => (
                <tr key={policy.id} className="border-t border-line-soft text-ink">
                  <td className="py-1.5">{policy.name}</td>
                  <td className="py-1.5">{Math.round(policy.first_response_minutes / 60)}h</td>
                  <td className="py-1.5">{Math.round(policy.resolve_minutes / 60)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-ink-3">
          Business-hours targets for humans — the AI responds instantly regardless.
        </p>
      </section>

      {isOwner && <GdprPanel erase={eraseCustomerDataAction} />}
    </div>
  );
}
