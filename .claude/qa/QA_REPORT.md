# QA Sentinel Report — TG Support Desk
_Run 2026-06-26 · 1 find→fix→verify round · stopped because all remaining findings are [HUMAN]_

## Verdict
**SHIP WITH NOTES** — the application-layer security model is genuinely strong (every action authenticates, portal IDOR is correctly double-scoped, untrusted content stays in the `user` role, no secret reaches the client bundle). All auto-fixable findings are fixed and the regression gate is green. The residual items are migrations/policy calls, none of which block the current **shadow-mode, single-tenant, pre-go-live** demo — but [C1] and [S3]/[S4] should be closed **before shadow mode is switched off** (i.e. before the AI ever emails a customer).

## Headline risks
1. **[C1] Duplicate AI emails once live.** Inbound-email dedup is check-then-act with no DB-level uniqueness, and `poll-gmail` (per-minute, 300s budget) can overlap itself → two tickets + two AI replies on one thread. Latent in shadow mode; a go-live blocker.
2. **[S3] Portal AI cost-drain.** Rate limits are a non-atomic audit-log COUNT with no per-day spend cap — an authenticated client can burst paid Anthropic/Voyage calls above the intended ceiling.
3. **[S4] Spoofable sender trusted.** First-contact email with missing auth-results (`"unknown"`) is AI-processed rather than escalated — matters once shadow mode is off.

## Fixed this run
### P1
- `src/lib/cron-auth.ts` (new) + 9 routes — **[S1]** `CRON_SECRET` now compared with `crypto.timingSafeEqual` (was early-exit `!==`) across all cron routes and `/api/ai/resolve`. · verified: tsc/eslint/build green.
- `auth.ts`, `channels/gmail.ts`, `ai/embeddings.ts`, `integrations/airtable-clients.ts`, `integrations/firecrawl.ts`, `ai/agent.ts`, `ai/copilot.ts`, `ai/triage.ts` — **[C2]** added timeouts to every outbound call (`AbortSignal.timeout` on `fetch`; `timeout` on the Anthropic SDK). `auth.ts` gates every request, so it can no longer hang the whole app. · verified: build green; each timeout degrades through existing handlers (auth fails closed).
- `db/queries.ts` `mergeTickets` — **[C3, partial]** tenant-scoped the message move (`.eq("tenant_id", …)`). Atomicity → see Needs your decision.
### P2
- `db/search-term.ts` (new) + `db/queries.ts` `searchAll` — **[S2]** user search term sanitised before the PostgREST `or()` filter (was raw-interpolated → filter-injection). · verified: 4 new regression tests in `db/search-term.test.ts`.
- `ticket/copilot-actions.ts` — **[S6]** copilot actions now return a generic message and `console.error` the detail (was returning raw `error.message` to the UI).
- `.env.example` — **[C4]** added the missing vars, incl. the safety-critical **`AI_SHADOW_MODE`**, plus `RERANK_MODEL`, `FIRECRAWL_API_KEY`, `UNIVERSITY_*`, and the cron-tuning vars.
### P3
- `next.config.ts` — **[S5]** added `Strict-Transport-Security` (HSTS). No `includeSubDomains`/`preload` (avoids committing sibling `*.travelify.io` subdomains).
- `api/cron/stale-tickets/route.ts` — **[C7]** the two sweeps now run concurrently via `Promise.all` (were sequential despite the array shape).

## Needs your decision (not auto-fixed)
- **[P1] `channels/email.ts` + `poll-inbox.ts` ([C1])** — inbound-email dedup has no atomicity and the cron can overlap itself. Recommendation: add a partial unique index `tickets (tenant_id, email_thread_key) where email_thread_key is not null`, handle the unique-violation by re-fetching the existing ticket, and persist `processedIds` incrementally (or take a short cron lease in `channel_sync_state`). Why not auto-fixed: DB migration + concurrency design. **Do before shadow mode is turned off.**
- **[P1] `db/queries.ts` `mergeTickets` ([C3])** — the 5 writes aren't transactional; a mid-merge failure leaves an emptied-but-open source ticket. Recommendation: move the merge into a Postgres function/RPC (one transaction). Why not auto-fixed: needs a migration. (Tenant-scoping already added.)
- **[P2] `portal/actions.ts` ([S3])** — rate limit is a non-atomic COUNT and there's no per-day AI-spend cap. Recommendation: atomic insert-and-count RPC (or counter table) + a per-tenant/day Anthropic+Voyage ceiling. Why not auto-fixed: limiter redesign + migration.
- **[P2] `channels/email.ts` + `email-parse.ts` ([S4])** — sender verification only escalates on `"fail"`, not `"unknown"`. Recommendation: treat `"unknown"` as unverified (tag + escalate + suppress AI) for first contact, or require a positive `"pass"` before the AI auto-replies once live. Why not auto-fixed: policy call (may add false-positive escalations).
- **[P2] `channels/poll-inbox.ts` ([C5])** — a transient Gmail *fetch* failure marks the message processed → that inbound email is silently dropped forever. Recommendation: only mark processed on a successful fetch (keep marking ingest-time poison), with a bounded retry counter. Why not auto-fixed: retry-policy judgment.
- **[P3] CSP (`next.config.ts`)** — no `Content-Security-Policy` behind the `sanitizeEmailHtml` allowlist (the ticket thread renders attacker email HTML via `dangerouslySetInnerHTML`). Recommendation: add a nonce-based CSP as the second layer. Why not auto-fixed: needs nonce wiring against Next's inline runtime (already tracked).
- **[P3] `db/analytics.ts` ([C8])** — metrics silently cap at 5000/20000 rows. Recommendation: aggregate server-side (SQL `count`/`group by`) or surface "based on most recent N" before volume passes the caps. Why not auto-fixed: architecture call; not a near-term issue at ~300 clients.

## Residual risk
- **Dependencies:** `npm audit` = 3 advisories (1 low `esbuild` dev-server Windows-only; 2 moderate `postcss`/`next` transitive). The only available "fix" forces Next → 9.x (breaking). All are build/dev-tooling, not runtime user-input paths. Lockfile committed. Documented residual — revisit when Next ships a patched `postcss`.
- **RLS is defense-in-depth only:** all DB access is service-role server-side (which bypasses RLS); there is no client-side anon key. Correct for this architecture, but RLS becomes load-bearing the day a client-side anon-key path is ever added.
- **`recordCsat` ([C9])** — check-then-act on status, but last-write-wins on a scalar makes it benign; no action.

## Run stats
- Rounds completed: 1 / 3 cap
- Baseline → final: build PASS → PASS · tsc clean → clean · tests 73 → **77** pass · lint 0 → 0 · audit 3 → 3 (unchanged)
- Findings: 0 P0 · 4 P1 · 6 P2 · 5 P3 (15 total) · auto-fixed 7 (+2 partial) · flagged [HUMAN] 7
- Loop stopped because: no auto-fixable findings remain — every residual item is a migration or policy decision ([HUMAN]).
