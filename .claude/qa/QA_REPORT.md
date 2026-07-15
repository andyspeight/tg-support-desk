# QA Sentinel Report — TG Support Desk
_Run 2026-07-15 · client-facing surface sweep · 1 find→fix→verify round + independent adversarial re-verify · stopped because all remaining findings are [HUMAN]_

## Verdict
**SHIP WITH NOTES** — the client-facing surface shipped for today's go-live (public help centre with anonymous submission, email magic-link sign-in, and company-wide ticket visibility) is sound. The headline risk — a client seeing **another company's** tickets — was real (Airtable substring matching), is now **fixed and independently verified**, and is covered by regression tests. All auto-fixable findings are fixed; the regression gate is green (178 tests, tsc + eslint + build clean). Residuals are single-tenant/policy items and carry-forward migrations, none of which block the current run.

## Headline risks
1. **[FIXED · P1] Cross-company ticket leak.** Airtable `FIND()` is substring containment, so `bob@x.co` matched a record holding `bob@x.co.uk`, and `@acme.co` matched `acme.co.uk`. With magic-link auth + company-wide visibility that exposed another company's tickets. Now decided in code by whole-address / exact-domain matchers. **Independently verified sound.**
2. **[FIXED · P1] Magic-link session CSRF.** A cross-site GET could previously mint a session. The session is now minted only by a same-origin POST server action, single-use via an atomic `used_login_tokens` primary key, order verify→consume→set, fail-closed. **Verified sound.**
3. **[CARRY-FORWARD · P1] Duplicate AI emails once live ([C1]).** Inbound dedup still has no DB-level uniqueness. Overlap is now mitigated by the `channel_sync_state` cron lease + pre-resolve `processedIds` persistence in `poll-inbox.ts`, but the belt-and-braces unique index is still recommended before shadow mode is switched off.

## Fixed this run
### P1
- `integrations/client-match.ts` (new, pure) + `integrations/airtable-clients.ts` — **cross-company leak.** `matchClientByEmail` is now a coarse `FIND()` prefilter followed by precise in-code verification: `pickExactEmailMatch` (whole-address equality) then `pickDomainMatch` (exact-domain, free/ISP-guarded). · verified: 6 new tests in `client-match.test.ts` (`.co`/`.co.uk`, `a@b.com@evil.com`, empty local part); adversarial verify confirmed no truncated-token or throw path.
- `app/(client)/signin/*`, `app/api/portal-auth/verify/route.ts`, `db/queries.ts` `consumeLoginToken`, migration `0025_used_login_tokens.sql` — **login CSRF.** Verify GET only *peeks* (no cookie); `completeSignInAction` is a POST-only server action; `jti` single-use enforced by primary-key insert (23505 → reject); fresh `aud:"session"` token minted only after verify+consume succeed. · verified: enumerated every `desk_session` writer; SSO callback GET still requires HMAC handoff + `sso_state` nonce.
### P2
- `lib/client-ip.ts` (new) + `app/(client)/actions.ts`, `signin/actions.ts` — **spoofable rate-limit key.** `clientIp()` prefers `x-vercel-forwarded-for` / `x-real-ip` / rightmost XFF over the spoofable leftmost hop. · verified: both limiters key consistently.
- `channels/email.ts` `sendAutoAck` + `app/(client)/actions.ts` — **anon subject reflection.** An anonymous portal submitter's attacker-controlled subject is no longer reflected into an outbound `Re: <anything>`; a neutral fixed subject is used when `verifiedRecipient === false`. · verified: only anon path is neutralised; verified-recipient paths keep threading.
### P3
- `app/staff/settings/actions.ts`, `app/staff/ticket/actions.ts` — **company-id hardening.** `clientId` zod-constrained to `/^rec[A-Za-z0-9]{14}$/` (or `"none"`); `getClientById` builds its path with `encodeURIComponent`. · verified sound.
- `channels/email-parse.ts` `FREE_MAIL_DOMAINS` — added US shared-ISP domains (comcast/verizon/att/sbcglobal/cox/bellsouth/charter/roadrunner/optonline/earthlink) so two unrelated US firms can't domain-group. · verified: `email-parse.test.ts` consistency test still green.

## Needs your decision (not auto-fixed)
_This run's residuals_
- **[P3] "No company" (`clientId: none`) bypassable by +alias.** A linked-to-none address can still be reached via `user+tag@domain`, which resolves independently. Low risk (requires knowing the block exists). Recommendation: normalise `+tag` local parts when resolving a company. Why not auto-fixed: policy call (some clients legitimately use +aliases).
- **[P2/latent] `tenant_id` scoping on other by-id reads.** `getMessageById` / `getKbArticle` / `getOutreachIncident` / `updateTicket` aren't tenant-scoped. Harmless single-tenant; add scoping before multi-tenant launch. Why not auto-fixed: no bug today; touches many call-sites.
- **[P3] `proxy.ts` redirects `/api/sso/check`.** Can break the SSO auto-poll return path. Functional, and secondary now that magic-link is the primary sign-in. Why not auto-fixed: needs an SSO-flow decision.
- **[P3] No CSP behind `sanitizeEmailHtml`.** The ticket thread now renders sender HTML **including embedded `<img>`** (this run) via `dangerouslySetInnerHTML`. Images are same-origin `/api/attachments/…` (302 → Supabase signed URL) and the allowlist has no active/SVG types, so nothing executes — but a nonce-based CSP with an explicit `img-src` for the storage origin is the right second layer. Why not auto-fixed: nonce wiring against Next's inline runtime.

_Carried forward from the 2026-06-26 run (still open unless noted)_
- **[P1] Inbound dedup atomicity ([C1])** — partial unique index `tickets (tenant_id, email_thread_key) where email_thread_key is not null` + unique-violation re-fetch. **Overlap now mitigated** by the cron lease + incremental `processedIds`; the index is still the durable fix. **Do before shadow mode is turned off.**
- **[P1] `mergeTickets` not transactional ([C3])** — move the 5 writes into one Postgres RPC. (Tenant-scoping already added.)
- **[P2] Portal AI cost-drain ([S3])** — non-atomic rate-limit COUNT + no per-day AI-spend cap.
- **[P2] Spoofable sender trusted ([S4])** — sender verification escalates on `"fail"` but not `"unknown"`; decide the first-contact policy before the AI emails customers.
- **[P2] Dropped inbound on transient Gmail fetch failure ([C5])** — only mark processed on a successful fetch, with a bounded retry.
- **[P3] Analytics row caps ([C8])** — metrics silently cap at 5000/20000 rows; aggregate server-side before volume passes the caps.

## Residual risk
- **Freemail/ISP denylist is inherently incomplete.** It now covers the major global + UK/EU/US free and shared-ISP providers, but a novel shared mailbox could still domain-group two unrelated firms. Mitigation in product: explicit company links (Settings / the ticket Customer 360 panel) override matching entirely.
- **Unverified-anon auto-ack is a benign email primitive.** Auto-acking an unverified anonymous submission lets someone trigger one branded receipt to an address they typed; the body is text-only and HTML-escaped, so there's no injection. Pre-existing; acknowledged in code.
- **RLS is defense-in-depth only.** All DB access is service-role server-side; app-level filters are the boundary. Correct for this architecture; RLS becomes load-bearing the day a client-side anon-key path is added.

## Run stats
- Rounds completed: 1 / 3 cap (+ independent adversarial re-verify of all six fixes)
- Baseline → final: build PASS → PASS · tsc clean → clean · tests 165 → **178** pass · lint 0 → 0
- Findings this run: 0 P0 · 3 P1 · 2 P2 · P3 hardening · auto-fixed all P1/P2 · flagged [HUMAN] (this run + carry-forward)
- Loop stopped because: no auto-fixable findings remain — every residual is a migration or policy decision. Adversarial verify returned all six fixes **sound, no regressions**.
