# TG Support Desk — Development Path to 70%+ Autonomous Resolution

**Status:** adopted 12 Jun 2026 · companion to [AGENTS.md](../AGENTS.md) (the canonical brief).
This document sharpens the brief's four phases into a sequenced build plan with exit
criteria, a competitive-parity checklist (no feature loss vs Zendesk/Freshdesk), and the
operating ritual that ratchets the autonomous-resolution rate to 70%+.

---

## 1. North star

**70%+ of all inbound tickets resolved with no human reply**, sustained over a rolling
30 days, measured strictly: closed with no human reply, not reopened within 72h, CSAT not
negative. (This raises the brief's 55–65% goal; the 80% ceiling stands.)

Why it's credible: AI-native vendors benchmark at 55–70% (Fin ~67% avg, Sierra ~70%,
Decagon claims ~80% deflection) while reading knowledge only. We own the product the AI
supports — live client config, supplier error feed, deeplink validation, corrective
actions — which converts whole categories from "escalate" to "resolved in conversation".

**The ratchet** (each stage has one lever):

| Milestone | Target | Lever |
|---|---|---|
| Day 60 of parallel run | ≥50% | KB coverage + client context (Phase 1 tools) |
| + diagnostics live | ≥65% | Supplier errors / deeplink / endpoint health tools |
| + actions & learning loop | **70%+ sustained** | Gated corrective actions + ticket-mined KB + weekly gap ritual |

**Ticket-mix hypothesis** (validate in week 1–4 of the parallel run, then re-plan):
~40–50% how-to/config (KB wins), ~20–25% "something's broken" (diagnostics win),
~10% account/setup lookups (client context wins), ~15–20% commercial/billing/supplier-
commercial (permanent human residual), ~5% misc. 70% requires winning nearly all of the
first three buckets — the residual is the hard floor, so measure it early.

## 2. Operating principles (from the brief — unchanged)

- AI-first: every ticket gets an AI first touch; humans only see prepared handovers.
- Four terminal states per turn; never silent; guardrails (no invented facts, no
  commercial commitments) are non-negotiable and enforced in code, not just prompt.
- Staged vertical slices; never rebuild; eval harness green before any prompt/tool change
  ships; security checklist per stage; multi-tenant bones in everything.
- **Simple > featureful.** Zendesk bloat is the anti-goal. The parity checklist below is
  the fence: features outside it need ticket-volume evidence to get built.

## 3. Competitive parity map (no feature loss)

Everything the team uses in Zendesk/Freshdesk today must have a home before cancellation.
Stage = where it lands. "AI-replaced" = we deliberately cover the job a different way.

| Helpdesk table stakes | Ours | Stage |
|---|---|---|
| Email-to-ticket, threading, reopen | ✅ live | 1 |
| Inbox views + counts (mine/unassigned/escalated/waiting) | ✅ live | 1 |
| Canned responses | ✅ live (mgmt UI S2) | 1→2 |
| KB + review workflow | ✅ live (seeded, 171 in review) | 1 |
| Multi-language support | ✅ live (AI-native, better than parity) | 1 |
| Audit trail | ✅ live (exceeds — every AI tool call) | 1 |
| Auto-reply/OOO/bounce loop guard, spam handling | build | 2 |
| CC / multiple recipients on a ticket | build | 2 |
| Attachments (caps, allowlist, signed URLs) | build | 2 |
| Global search (tickets + messages) | build | 2 |
| Merge tickets | build | 2 |
| Bulk actions + keyboard triage | build | 2 |
| Collision detection (agent presence) | build | 2 |
| Agent notifications (assignment/escalation) | build | 2 |
| Dispatch/triage automation rules | **AI-replaced**: utility-model auto-classify (intent, priority, language → tags) on ingest | 2 |
| SLA policies + business hours + breach view | build (schema live) | 3 |
| CSAT surveys | build | 3 |
| Reporting/analytics | build (v1) | 3 |
| Live chat / messaging channel | widget (SSO, fork Luna widget-core) | 3 |
| Customer context panel | **exceeds**: Customer 360 (Airtable + CRM + Luna + history) | 3 |
| Agent assist (draft/rephrase/summarise/translate) | copilot | 3 |
| Macros (multi-action) | covered by canned + quick status actions + copilot; revisit only if agents ask | 3 |
| Self-service portal + ticket deflection | public KB portal | 4 |
| KB article feedback ("was this helpful?") | portal | 4 |
| WhatsApp channel | 360dialog reuse | 5 |
| Roles/permissions, multi-brand/mailbox | multi-tenant surface | 5 |
| Round-robin / skills routing | skip at 3 agents + AI-first; backlog with volume trigger | — |
| Parent–child / linked tickets, side conversations | backlog; build on demand only | — |
| Voice/phone, ITSM (assets/changes/approvals), app marketplace | **non-goals** per brief | — |

## 4. Stage-by-stage plan

### Stage 1 — Light the fire (go-live gate → parallel run starts)
*Everything here is config + curation; the code is live.*
- [ ] Env vars into Vercel (Supabase service key, Anthropic, Voyage, Airtable PAT + Clients
  base + email-field names, Gmail OAuth for support@, TG_AUTH_SESSION_URL, AGENT_EMAILS,
  CRON_SECRET).
- [ ] `.travelify.io` subdomain assigned (SSO cookie scope) + sign-in verified for each agent.
- [ ] Gmail round-trip smoke test (test thread: ingest → AI reply → threading correct).
- [ ] Curate the 171-article review queue: approve/edit/bin; rewrite prospect-voice answers
  into support voice where needed; publish (embeds on publish).
- [ ] Write ~10 support-voice how-to articles for the known top intents (widget embed,
  supplier credential errors, deeplink format, CMS/blog basics, Travelify pricing rules,
  deposit rules, promo codes, user/role admin, order manager, "search returns nothing" triage).
- [ ] Grow eval set 3 → 10 cases from real (anonymised) Zendesk ticket themes; suite green.
- [x] Security checklist pass (brief §10) for the live surface — RLS, server-only
  secrets, input sanitisation, signed-URL attachments, rate limits, SSO CSRF/replay
  hardening, audit log; GDPR export/delete shipped. (Retention policy still to document.)
- [ ] Agent onboarding: 30-minute walkthrough; agents work the **AI-escalated** view only.
- [ ] Parallel-run protocol: new tickets → desk; legacy/open tickets finish in Zendesk;
  Zendesk export not needed (clean start, decided 12 Jun).
- **Exit:** ≥10 real tickets handled end-to-end; first response <60s; zero guardrail
  breaches; agents call handovers "2-minute jobs".

### Stage 2 — Helpdesk parity hardening (parallel-run weeks 1–3)
*Goal: agents never miss Zendesk; the email channel survives the real world.*
- [ ] **Loop guard** (build first): never AI-reply to `Auto-Submitted`/`X-Autoresponder`/
  bounce senders; per-thread outbound throttle; suppress AI on suspected loops.
- [ ] CC/multi-recipient capture (requester vs cc[] on ticket; replies keep the cc line).
- [ ] Attachments: ingest from Gmail (type allowlist, size caps), Supabase Storage,
  signed URLs in the thread UI; never inline-executed.
- [ ] Spam: respect Gmail spam, add sender blocklist + utility-model spam flag.
- [ ] Global search across tickets + messages (FTS already indexed).
- [ ] Merge tickets (messages move, audit written); bulk status/assign/tag; keyboard triage
  (j/k/enter/r/e); collision indicator + live inbox via Supabase Realtime (minted JWT —
  replaces the 20s poller).
- [ ] **AI triage on ingest** (Haiku): intent category, suggested priority, language →
  tags. Replaces Freshdesk dispatch/observer rules with one cheap call and seeds the
  intent taxonomy analytics needs.
- [ ] Canned-response and tag management UI; agent email notifications (assignment,
  escalation, imminent breach).
- [ ] Ops: cron-failure alerting, error log drain, on-call runbook.
- **Exit:** side-by-side audit of the team's Zendesk workflows — every one has a home;
  agents sign off in writing.

### Stage 3 — Channels, 360 and honest measurement (brief Phase 2; weeks 3–6)
*Measurement comes first — the 70% claim is only as good as its instrumentation.*
- [ ] **CSAT** (gates the headline metric): one-tap signed-link survey on resolve; score +
  comment to ticket; AI-resolved vs human-resolved tracked separately.
- [ ] **Analytics v1** at `/analytics`: true resolution rate (strict definition), rate by
  intent, first-response/full-resolution times, SLA compliance, escalation-reason Pareto,
  volume by client (top 10 → CRM care conversations). All from tickets + ai_events.
- [ ] SLA engine: business-hours calendar, breach computation, "Breaching SLA" view,
  breach notifications.
- [ ] **Widget channel**: fork Luna Chat widget-core (IIFE, shadow DOM, session
  persistence); SSO identity pre-resolved → same resolution loop, streaming replies,
  translation kept; concierge features stripped.
- [ ] **Customer 360 panel**: Airtable live card + support history (open/recent tickets,
  lifetime CSAT) + CRM seam (care status, health flag) + Luna Chat/Marketing seams as
  they expose data + integration errors last-7-days preview.
- [ ] **Copilot** (utility model): draft grounded reply, rephrase to brand voice,
  summarise thread, translate.
- **Exit:** widget live with ≥3 pilot clients; AI-resolved CSAT ≥4.5; analytics
  spot-audited against 20 hand-checked tickets.

### Stage 4 — The 70% engine (brief Phase 3; weeks 6–10)
*This is the stage that separates us from every bolt-on AI desk.*
- [ ] Productise the supplier error feed (integrations@agendas.group pipeline → internal
  API) → `get_integration_errors(client_id, days)`. "Search returns nothing" becomes
  "Supplier X credentials failed at 09:14 — here's the fix."
- [ ] `validate_deeplink(url)` against the official spec → names the malformed parameter.
- [ ] `check_endpoint_health(client_id)` → widget/config reachability + recent errors.
- [ ] **Gated corrective actions**: `trigger_kb_rescan`, `regenerate_embed_snippet`, plus
  2–3 more chosen from the live escalation Pareto. Every action: allowlisted,
  parameter-validated, audited, **verified afterwards** (re-run the diagnostic; only then
  tell the customer it's fixed).
- [ ] **Procedures**: runbook-style KB articles the agent follows stepwise for the top 10
  travel intents (diagnose empty search, credential refresh, widget not rendering…).
- [ ] **Self-improvement loop automated**: human-resolved escalation → utility model
  drafts KB candidate (`source: ticket_mined`) → review queue. Weekly gap digest:
  resolution trend, escalation Pareto, repeated-failure intents, candidates awaiting review.
- [ ] Eval harness ≥50 real anonymised cases; CI gate on every prompt/tool change; score
  trend tracked.
- [ ] **Public KB portal** `support.travelify.io`: search, article feedback, ticket
  submission with AI deflection; rate-limited and spam-guarded (hostile input).
- **Exit:** ≥65% true resolution rolling 30d; each diagnostic tool credited in real
  resolutions; zero unverified "it's fixed" claims in audit.

### Stage 5 — Scale, expand, cancel Zendesk (brief Phase 4; weeks 10–14)
- [ ] WhatsApp via 360dialog (reuse Luna Chat omnichannel inbound work) → same loop.
- [ ] CRM two-way live: support signal pushed on close (volume trend, sentiment, last
  issue summary) → churn early-warning; care status pulled into the 360.
- [ ] Multi-tenant settings surface (tenant config, per-tenant KB/mailbox/branding) —
  groundwork for the sellable Luna product.
- [ ] GDPR tooling: per-client export + delete, retention policy, PII-minimisation audit.
- [ ] Performance/cost pass: prompt caching (stable system prefix), embedding batching,
  model-mix review, rate limits on all public endpoints; Gmail→inbound-parse provider
  trigger if volume demands.
- [ ] **Zendesk cancellation gate** (all must hold): ≥4 weeks parallel AND ≥200 tickets
  AND ≥50% true resolution AND agent sign-off AND no Sev-1 incidents. Then cancel.
- **Exit:** Zendesk cancelled; 70%+ within reach or achieved; weekly digest steering KB.

## 5. The weekly ratchet ritual (how 70% actually happens)

- Monday: gap digest → pick the **top two escalation causes** → classify the fix:
  new/edited KB article · new procedure · new tool/action · prompt tweak · "accept as
  permanent residual".
- Any prompt/tool change: add the failing case to the eval set first, make it pass, keep
  the suite green, ship.
- Monthly: re-baseline the intent taxonomy from live tags; prune stale KB; read AI-vs-human
  CSAT gap; check cost per resolution vs Fin's ~$0.99 benchmark.

## 6. Risks → counters

- **KB too thin → ratchet stalls ~45%**: ticket-mined drafting from week 1 (manual at
  first), the 10 hand-written how-tos before go-live, weekly Pareto discipline.
- **Auto-reply loops / spam burn money and trust**: Stage 2 loop guard ships before volume.
- **Over-escalation from strict guardrails** (e.g. benign "contract" mentions): measure
  false-escalation rate in the Pareto; tune regexes with eval cases, never delete the
  guardrail class.
- **Sender spoofing**: keep fail-closed verification; enforce DMARC on travelify.io.
- **Model/API drift**: pinned model via env, eval suite as the regression net.
- **Gmail quota/limits at volume**: trigger point defined (sustained >X/day or quota
  pain) → dedicated inbound-parse provider, already seamed.
- **Scope creep vs "simple"**: §3 is the fence. New features need ticket-volume evidence.

## 7. Standing inputs needed from Andy

- Env credentials (Stage 1 list) · agent names/emails · SLA target sign-off (defaults
  proposed in AGENTS.md §12) · KB review-queue curation time (~2–3 hours) · pilot client
  shortlist for the widget (Stage 3) · sign-off at each stage exit.
