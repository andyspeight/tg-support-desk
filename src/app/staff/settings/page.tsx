import { ImageDown, Palette, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  listAllowedSenders,
  listBlockedSenders,
  listCannedResponses,
  listCompanyDomains,
  listCompanyMembers,
  listCompanyPeople,
  listRestrictedCompanies,
  listSlaPolicies,
  listTags,
} from "@/lib/db/queries";
import { listAllClientCompanies } from "@/lib/integrations/airtable-clients";
import { MaintenancePanel } from "@/components/maintenance-panel";
import { GdprPanel } from "@/components/gdpr-panel";
import { AddCompanyForm } from "@/components/add-company-form";
import {
  addAllowedAction,
  addBlockedAction,
  createCannedAction,
  createCompanyAction,
  createTagAction,
  deleteCannedAction,
  deleteTagAction,
  eraseCustomerDataAction,
  recoverBlockedAttachmentsAction,
  restoreMessageFormattingAction,
  importAllowedAction,
  linkCompanyMemberAction,
  setCompanyRestrictionAction,
  setPersonVisibilityAction,
  removeAllowedAction,
  removeBlockedAction,
  unlinkCompanyDomainAction,
  unlinkCompanyMemberAction,
  updateCannedAction,
} from "./actions";

function show(value: string | undefined): string {
  return value && value.length > 0 ? value : "not configured";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { company: companyParam } = await searchParams;
  // Shape-check the id from the URL before it reaches a query.
  const selectedCompanyId = companyParam && /^rec[A-Za-z0-9]{14}$/.test(companyParam) ? companyParam : null;

  const [slaPolicies, canned, tags, blocked, allowed, companyLinks, companyDomains, companies, restrictedCompanies] =
    await Promise.all([
    listSlaPolicies().catch(() => []),
    listCannedResponses().catch(() => []),
    listTags().catch(() => []),
    listBlockedSenders().catch(() => []),
    listAllowedSenders().catch(() => []),
    listCompanyMembers().catch(() => []),
    listCompanyDomains().catch(() => []),
    listAllClientCompanies().catch(() => []), // Airtable — empty on a wobble, the panel says so
    listRestrictedCompanies().catch(() => []),
    ]);
  const agents = (process.env.AGENT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  const restrictedIds = new Set(restrictedCompanies.map((c) => c.client_id));
  const selectedRestricted = selectedCompanyId ? restrictedIds.has(selectedCompanyId) : false;
  const selectedCompanyName = selectedCompanyId
    ? (companies.find((c) => c.id === selectedCompanyId)?.name ??
       restrictedCompanies.find((c) => c.client_id === selectedCompanyId)?.client_name ??
       null)
    : null;
  const companyPeople = selectedCompanyId ? await listCompanyPeople(selectedCompanyId).catch(() => []) : [];

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
        <h2 className="text-sm font-semibold">Allowed senders {allowed.length > 0 && <span className="font-normal text-ink-3">({allowed.length})</span>}</h2>
        <p className="mt-1 text-xs text-ink-3">
          First-time senders who aren’t on this list and aren’t matched to a client are held in{" "}
          <span className="font-medium">Pending approval</span> — the AI won’t reply until an agent approves them. Use an
          exact address, or <code className="rounded bg-surface-2 px-1">@domain.com</code> to trust a whole company.
          Known clients in Airtable are trusted automatically.
        </p>
        <div className="mt-2 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
          {allowed.length === 0 && <p className="text-sm text-ink-3">None yet.</p>}
          {allowed.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink">
              {a.pattern}
              <form action={removeAllowedAction} className="inline">
                <input type="hidden" name="id" value={a.id} />
                <button className="text-ink-3 hover:text-red-600 dark:hover:text-red-400" aria-label={`Remove ${a.pattern}`}>
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </form>
            </span>
          ))}
        </div>
        <form action={addAllowedAction} className="mt-3 flex gap-2 border-t border-line-soft pt-3">
          <input
            name="pattern"
            required
            placeholder="client@example.com or @example.com"
            className="flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
          />
          <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-surface-2 dark:text-ink dark:hover:bg-line">
            Allow
          </button>
        </form>
        <form action={importAllowedAction} className="mt-3 border-t border-line-soft pt-3">
          <label htmlFor="allow-import" className="text-xs text-ink-3">
            Bulk import — paste addresses and/or <code className="rounded bg-surface-2 px-1">@domain.com</code> rules,
            separated by new lines, commas, or spaces. Duplicates are skipped.
          </label>
          <textarea
            id="allow-import"
            name="patterns"
            rows={3}
            placeholder={"@acme-travel.com\njane@example.com, @another-client.co.uk"}
            className="mt-1.5 w-full rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-xs placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
          />
          <button className="mt-2 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
            Import to allow-list
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">
          Ticket visibility by company{" "}
          {restrictedCompanies.length > 0 && (
            <span className="font-normal text-ink-3">({restrictedCompanies.length} restricted)</span>
          )}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-3">
          By default everyone at a client company sees <span className="font-medium text-ink-2">all</span> of that
          company’s tickets — nothing changes unless you restrict the company below. Once restricted, its people see
          only their own tickets, except anyone you mark <span className="font-medium text-ink-2">Sees all</span>.
        </p>

        {/* Step 1 — pick a company. Plain GET so the choice lives in the URL and
            the page can load that company’s people server-side. */}
        <form method="get" className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            name="company"
            defaultValue={selectedCompanyId ?? ""}
            aria-label="Company"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink-2 focus:border-ink-3 focus:outline-none"
          >
            <option value="">
              {companies.length === 0 ? "Company list unavailable" : "Choose a company…"}
            </option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {restrictedIds.has(c.id) ? " — restricted" : ""}
              </option>
            ))}
          </select>
          <button className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-surface-2 dark:text-ink dark:hover:bg-line">
            Show users
          </button>
        </form>

        {selectedCompanyId && (
          <div className="mt-3 rounded-md border border-line-soft p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {selectedCompanyName ?? selectedCompanyId}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                  selectedRestricted
                    ? "bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/40"
                    : "bg-surface-2 text-ink-3 ring-line"
                }`}
              >
                {selectedRestricted ? "Restricted — own tickets only" : "Open — everyone sees all"}
              </span>
              <form action={setCompanyRestrictionAction} className="shrink-0">
                <input type="hidden" name="clientId" value={selectedCompanyId} />
                <input type="hidden" name="restrict" value={selectedRestricted ? "off" : "on"} />
                <button className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2">
                  {selectedRestricted ? "Remove restriction" : "Restrict this company"}
                </button>
              </form>
            </div>

            {/* Step 2 — set the people. Shown whatever the company’s state, so you
                can prepare who gets the wider view before switching it on. */}
            <div className="mt-3 border-t border-line-soft pt-3">
              <p className="text-xs font-medium text-ink-2">
                People at this company {companyPeople.length > 0 && <span className="text-ink-3">({companyPeople.length})</span>}
              </p>
              {!selectedRestricted && (
                <p className="mt-1 text-xs text-ink-3">
                  This company isn’t restricted, so everyone here already sees all its tickets. Settings below apply as
                  soon as you restrict it.
                </p>
              )}
              <div className="mt-2 space-y-1.5">
                {companyPeople.length === 0 && (
                  <p className="text-sm text-ink-3">Nobody has raised a ticket for this company yet.</p>
                )}
                {companyPeople.map((p) => (
                  <div
                    key={p.email}
                    className="flex items-center gap-2 rounded-md border border-line-soft px-2.5 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink" title={p.email}>
                      {p.name ? `${p.name} · ` : ""}
                      <span className={p.name ? "text-ink-3" : ""}>{p.email}</span>
                    </span>
                    <span className="hidden shrink-0 text-xs text-ink-3 sm:inline">
                      {p.tickets} ticket{p.tickets === 1 ? "" : "s"}
                    </span>
                    <form action={setPersonVisibilityAction} className="shrink-0">
                      <input type="hidden" name="email" value={p.email} />
                      <input type="hidden" name="clientId" value={selectedCompanyId} />
                      <input type="hidden" name="seeAll" value={p.canSeeAll ? "off" : "on"} />
                      <button
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition ${
                          p.canSeeAll
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-300 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/40"
                            : "bg-surface-2 text-ink-3 ring-line hover:text-ink"
                        }`}
                        title={
                          p.canSeeAll
                            ? `${p.email} sees every ticket for this company — click to restrict to their own`
                            : `${p.email} sees only their own tickets — click to let them see all the company’s`
                        }
                      >
                        {p.canSeeAll ? "Sees all" : "Own only"}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {restrictedCompanies.length > 0 && (
          <p className="mt-3 border-t border-line-soft pt-3 text-xs text-ink-3">
            <span className="font-medium text-ink-2">Restricted:</span>{" "}
            {restrictedCompanies.map((c) => c.client_name ?? c.client_id).join(", ")}
          </p>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">
          Company links {companyLinks.length > 0 && <span className="font-normal text-ink-3">({companyLinks.length})</span>}
        </h2>
        <p className="mt-1 text-xs text-ink-3">
          Who belongs to which client company. Most users match automatically (their email or its{" "}
          <code className="rounded bg-surface-2 px-1">@domain</code> is on the Airtable client record) — add a link here
          when someone doesn’t (a gmail address, a consultant), or pick{" "}
          <span className="font-medium">No company</span> to cut an address off from a company it would otherwise match
          (e.g. someone who’s left). Linking a person also joins their past tickets to the company’s history.
        </p>
        <p className="mt-1.5 text-xs text-ink-3">
          <span className="font-medium text-ink-2">Ticket visibility</span> is set per company above — pick the company
          and you’ll see its people. A <span className="font-medium">Sees all</span> badge here just shows who already
          has the company-wide view.
        </p>
        <div className="mt-2 space-y-1.5">
          {companyLinks.length === 0 && <p className="text-sm text-ink-3">None yet — everything is matching automatically.</p>}
          {companyLinks.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-md border border-line-soft px-2.5 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink">{m.email}</span>
              <span className={`shrink-0 truncate text-xs ${m.client_id ? "text-ink-2" : "font-medium text-amber-700 dark:text-amber-400"}`}>
                {m.client_id ? (m.client_name ?? m.client_id) : "No company"}
              </span>
              {/* Read-only here — visibility is set per company above, so there's
                  only ever one place to change it. */}
              {m.client_id && m.can_see_all_tickets && (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/40">
                  Sees all
                </span>
              )}
              <form action={unlinkCompanyMemberAction} className="inline">
                <input type="hidden" name="id" value={m.id} />
                <button className="text-ink-3 hover:text-red-600 dark:hover:text-red-400" aria-label={`Remove link for ${m.email}`}>
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </form>
            </div>
          ))}
        </div>
        <form action={linkCompanyMemberAction} className="mt-3 flex flex-col gap-2 border-t border-line-soft pt-3 sm:flex-row">
          <input
            name="email"
            type="email"
            required
            placeholder="person@example.com"
            className="flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
          />
          <select
            name="clientId"
            required
            defaultValue=""
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink-2 focus:border-ink-3 focus:outline-none sm:max-w-56"
            aria-label="Company"
          >
            <option value="" disabled>
              {companies.length > 0 ? "Choose a company…" : "Companies unavailable (Airtable)"}
            </option>
            <option value="none">No company (block matching)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-surface-2 dark:text-ink dark:hover:bg-line">
            Link
          </button>
        </form>

        {env.airtableWriteConfigured ? (
          <AddCompanyForm action={createCompanyAction} />
        ) : (
          <p className="mt-3 border-t border-line-soft pt-3 text-[11px] leading-relaxed text-ink-3">
            Adding a brand-new company from here isn’t switched on yet — it needs the desk’s Airtable write access
            enabled. Until then, add the company in Airtable, then link the user above.
          </p>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">
          Company domains {companyDomains.length > 0 && <span className="font-normal text-ink-3">({companyDomains.length})</span>}
        </h2>
        <p className="mt-1 text-xs text-ink-3">
          Whole corporate domains tied to a company, so <span className="font-medium">everyone at that domain is associated
          automatically</span> — no need to add each person. A domain appears here when you link someone at a corporate
          address (from a ticket or above). Free-mail domains (gmail, outlook…) are never grouped, and an individual link
          above always overrides the domain. Remove one to send that domain back to normal matching (existing tickets keep
          their company).
        </p>
        <div className="mt-2 space-y-1.5">
          {companyDomains.length === 0 && (
            <p className="text-sm text-ink-3">None yet — link someone at a corporate address and their domain appears here.</p>
          )}
          {companyDomains.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-md border border-line-soft px-2.5 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-ink">@{d.domain}</span>
              <span className="shrink-0 truncate text-xs text-ink-2">{d.client_name ?? d.client_id}</span>
              <form action={unlinkCompanyDomainAction} className="inline">
                <input type="hidden" name="id" value={d.id} />
                <button className="text-ink-3 hover:text-red-600 dark:hover:text-red-400" aria-label={`Remove domain link for ${d.domain}`}>
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </form>
            </div>
          ))}
        </div>
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

      {isOwner && (
        <MaintenancePanel
          title="Recover blocked attachments"
          description="Screenshots sent from Outlook were refused because it labels them as generic files rather than images. That's fixed for new tickets — this fetches the earlier ones back from the support mailbox and attaches them to their tickets. Anything genuinely not an allowed file type stays blocked."
          action="Recover blocked attachments"
          idleLabel="Recover attachments"
          busyLabel="Recovering…"
          icon={<ImageDown className="h-4 w-4" strokeWidth={1.75} />}
          run={recoverBlockedAttachmentsAction}
        />
      )}
      {isOwner && (
        <MaintenancePanel
          title="Restore message formatting"
          description="Older tickets were stored with the sender's colours, tables and emphasis stripped out. New mail now keeps them — this fetches the earlier messages back from the support mailbox so they read the way the customer wrote them. Messages we can't fetch are left untouched."
          action="Restore message formatting"
          idleLabel="Restore formatting"
          busyLabel="Restoring…"
          icon={<Palette className="h-4 w-4" strokeWidth={1.75} />}
          run={restoreMessageFormattingAction}
        />
      )}
      {isOwner && <GdprPanel erase={eraseCustomerDataAction} />}
    </div>
  );
}
