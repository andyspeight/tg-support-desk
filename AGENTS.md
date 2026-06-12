# TG Support Desk — Build Brief for Claude Code

**Project:** AI-first support desk replacing Zendesk (working repo name: `tg-support-desk`)
**Owner:** Andy Speight, CEO, Travelgenix
**Date:** 11 June 2026
**Status:** Phase 1 blocking decisions locked (12 Jun 2026) → scaffold Phase 1
**Projects Airtable row:** `recXzOgLccwxylool` in base `appj9tksreHOwkhYg` / table `tblpyhPNhiQg3XkkT`

---

## 0. How to work on this project (read first)

This repo follows the `tg-onboarding` / `tg-b2b-crm` pattern:

- **This file becomes `AGENTS.md`** at the repo root and is the canonical project brief. Repo `CLAUDE.md` is a one-line `@AGENTS.md` pointer.
- **Port Andy's skills** into `.claude/skills/`: `travelgenix-design`, `travelgenix-taste`, `travelgenix-security`, `travelgenix-humanizer`, `airtable-operations`, `project-handover`, `travelgenix-debug`, `frontend-design`. Consult them before building UI, touching data, or shipping anything.
- **Project handover protocol applies.** Live state lives in the Projects Airtable row above. Fetch on resume; update Current Focus / Next Steps / Last Session Summary / Decisions Locked (append-only) / Session Count at the end of every session.
- **Commit directly to GitHub** from Claude Code. No file-paste workflow for this repo.
- **Staged builds.** Ship each phase as a working vertical slice. Never big-bang.
- **Never rebuild from scratch** once something exists — iterate.

---

## 1. What this is and why it exists

Travelgenix currently runs client support on Zendesk. This project replaces it with a purpose-built, **AI-first support desk** where every incoming query is handled end-to-end by an AI agent wherever possible, and humans only ever see a ticket after the AI has tried, diagnosed, and prepared a handover.

Two facts shape the design:

1. **Market context.** Ticket platforms with AI bolted on (Zendesk, Freshdesk) achieve roughly 10–25% true autonomous resolution. AI-native platforms (Fin, Sierra, Decagon, Lorikeet) achieve 55–70%. The gap is structural: their AI can only read knowledge.
2. **Our unfair advantage.** We own the entire product the AI is supporting. Our agent can identify the client instantly (SSO + Airtable client record), read their live configuration, query live diagnostics (supplier integration error feed, deployment logs, deeplink validation), and — with guardrails — take corrective action. That moves whole ticket categories from "escalate" to "resolved in conversation."

**Ambition:** 55–65% true AI resolution within three months of Phase 1 going live; 80%+ ceiling once diagnostic and action tools mature (Phase 3). The permanent human residual is genuine third-party matters: supplier outages, commercial/contract questions, billing disputes.

**Scope note:** v1 serves **Travelgenix supporting its ~300 B2B clients only** (travel agents, tour operators, OTAs, homeworkers, consortia — 80% UK, 6 countries). But the architecture is **multi-tenant from day one** (`tenant_id` on every table, tenant-scoped config and KB) so it can later become a sellable Luna product where clients support their own travellers.

---

## 2. Goals

1. **≥50% true AI resolution within 60 days of Phase 1 live** (KB-answerable tickets), rising to ≥65% after Phase 3 diagnostics. "True resolution" = closed with no human reply, not reopened within 72h, and CSAT not negative.
2. **First response < 60 seconds** on every channel, 24/7, in the client's language.
3. **Escalated tickets become 2-minute jobs** — every handover includes diagnosis, steps tried, and a drafted reply.
4. **Kill the Zendesk subscription** once parallel-run confidence is established.
5. **Support becomes a churn early-warning system** — ticket volume/sentiment surfaces on the customer record in the TG B2B CRM care programme.

## 3. Non-goals (v1)

- **No voice/phone channel.** Email + widget first; WhatsApp is Phase 4.
- **No ITIL/ITSM service management** (assets, change management, approvals). Zendesk bloat we don't use.
- **No traveller-facing support.** B2B clients only until multi-tenant launch.
- **No AI-handled billing or contractual commitments.** The AI never promises refunds, discounts, or contract changes — these escalate by policy.
- **No marketplace/app ecosystem.** Integrations are first-party seams.
- **No historic-ticket migration in Phase 1.** The desk starts clean — no Zendesk import; whether to import history/solutions is reassessed against the live support queue once the desk is built (decided 12 Jun 2026).

---

## 4. Architecture

### Stack

- **Next.js (App Router) + TypeScript + Tailwind v4**, deployed on Vercel team `agendasgroup` — same as `tg-onboarding` / `tg-b2b-crm`.
- **Supabase (Postgres) is the primary data store.** Tickets and messages are high-volume, relational, need realtime (live agent inbox) and full-text + vector search. Airtable's rate limits make it the wrong message store. Use Supabase Realtime for inbox updates, RLS everywhere, and **pgvector** for KB embeddings.
- **Airtable remains the source of truth for client identity** (Clients base). The desk reads client records via the existing patterns in `airtable-operations`; it does not duplicate client master data.
- **Anthropic API (server-side only)** for the resolution agent and copilot. Model choice per `product-self-knowledge` skill at build time; resolution agent on the strongest available model, copilot utilities can run cheaper.
- **Auth = Travelgenix SSO** (`tg_session` cookie on `.travelify.io`, `/api/auth-session` pattern from Luna Chat). Clients are identified through the same SSO when using the in-dashboard channel. Internal agents authenticate the same way with a role flag. No new password system.

### Repo shape (indicative)

```
tg-support-desk/
  AGENTS.md                  ← this brief
  CLAUDE.md                  ← "@AGENTS.md"
  .claude/skills/            ← ported skills
  src/app/                   ← routes: /inbox /ticket/[id] /kb /analytics /settings /portal
  src/app/api/               ← inbound-email, chat, ai/resolve, ai/copilot, csat, webhooks
  src/lib/ai/                ← agent loop, tools, prompts, guardrails, eval harness
  src/lib/channels/          ← email, widget, (whatsapp seam)
  src/lib/integrations/      ← airtable-clients, crm-seam, luna-chat-seam, luna-marketing-seam, error-feed
  src/lib/db/                ← Supabase client, queries, types
  supabase/migrations/
```

### Data model (Supabase)

All tables carry `tenant_id` (default: travelgenix).

- **tickets** — id, tenant_id, client_id (Airtable rec id), requester_name/email, channel (email|widget|portal|whatsapp), subject, status (new|ai_working|waiting_on_customer|escalated|resolved|closed), priority, assignee, tags[], sla_policy_id, first_response_at, resolved_at, ai_resolved (bool), escalation_reason, csat_score, csat_comment, language.
- **messages** — ticket_id, role (customer|ai|human|internal_note|system), body (raw + sanitised html), channel metadata, attachments[], created_at.
- **kb_articles** — title, body, source (manual|scan|ticket_mined|zendesk_import), status (draft|review|published), embedding (pgvector), tenant_id, updated_at.
- **ai_events** — ticket_id, turn, tools_called (jsonb), confidence, outcome (answered|action_taken|escalated|clarified), latency, tokens. This table powers analytics and the improvement loop.
- **canned_responses**, **sla_policies**, **tags**, **audit_log** (every AI action and every human admin action).

---

## 5. Channels (phased)

1. **Email-to-ticket (P0).** `support@` inbound → ticket created/threaded → AI resolution loop runs → reply sent from the same address. Threading by Message-ID/References headers + subject hash fallback. **Decided (12 Jun 2026):** Gmail API polling on the existing Google Workspace mailbox (fastest, reuses the connection already powering the integration-error pipeline); upgrade to a dedicated inbound-parse provider later if volume demands. Verify sender, strip signatures/quoted history before feeding the AI.
2. **In-dashboard support widget (P0/P2).** Embedded in the client dashboard behind SSO — the AI knows exactly who is asking before the first message. Fork the Luna Chat `widget-core` architecture (IIFE, shadow-rooted, session persistence) rather than building new; strip concierge features, keep translation.
3. **Public KB portal (P3).** `support.travelify.io` — searchable published KB + ticket submission for logged-out contacts.
4. **WhatsApp (P4).** Reuse the 360dialog Phase 1 inbound work from the Luna Chat omnichannel project.

---

## 6. The AI resolution engine (the heart)

A server-side agentic loop. Every inbound customer message triggers it. The agent must end every turn in exactly one of four states: **answered**, **action taken + verified**, **clarifying question**, or **explicit escalation**. It never loops silently and never leaves a ticket untouched.

### Tools (build in this order)

**Phase 1**
- `search_kb(query)` — pgvector RAG over published KB articles.
- `get_client_context(client_id)` — Airtable client record: plan, supplier integrations, widget installs, Luna Chat status, key URLs.
- `search_past_tickets(query, client_id?)` — resolved-ticket retrieval for "how was this solved before."

**Phase 3 — diagnostics (the differentiator)**
- `get_integration_errors(client_id, days)` — query the supplier error feed (the existing `integrations@agendas.group` pipeline / integration-error-report logic, productised as an API). "My search returns nothing" → "Supplier X credentials failed at 09:14."
- `validate_deeplink(url)` — parse against the official deeplink spec; pinpoint the malformed parameter.
- `check_endpoint_health(client_id)` — widget/config endpoint reachability and recent error logs.

**Phase 3 — gated actions**
- `trigger_kb_rescan(client_id)`, `regenerate_embed_snippet(client_id)`, similar low-risk corrective actions. Every action: allowlisted, parameter-validated, written to `audit_log`, and **verified afterwards** (run the diagnostic again and confirm the fix before telling the customer it's fixed).

### Guardrails (non-negotiable)

- **No invented facts.** Supplier capabilities, pricing, contract terms come only from KB/tool results — this is the Knowledge Bot lesson. If the KB doesn't say it, the AI says so and escalates.
- **No commercial commitments.** Refunds, credits, discounts, contract or billing changes → mandatory escalation with a polite holding reply.
- **Escalation triggers:** explicit customer request for a human, two failed clarification rounds, negative-sentiment spike, any commercial/legal topic, any tool error the AI can't route around, confidence below threshold.
- **Handover package on every escalation:** one-paragraph diagnosis, evidence (tool outputs), steps already tried, suggested reply draft. Stored as an internal note at the top of the ticket.
- **Language:** detect and reply in the customer's language (reuse Luna Chat translation patterns); agents read everything in English.
- **Voice:** Travelgenix brand voice per `travelgenix-humanizer` — warm, plain, no AI tells, UK English.
- **Eval harness from day one:** `src/lib/ai/eval/` with a growing set of real anonymised tickets + expected outcomes; run before any prompt/tool change ships (travelgenix-debug discipline).

---

## 7. Agent app (the human side)

- **Inbox** — realtime views: My open, Unassigned, AI-escalated, Breaching SLA, Waiting on customer. Keyboard-first triage.
- **Ticket view** — conversation thread (AI turns visually distinct), the AI handover panel pinned on escalated tickets, reply box with send-as-email/widget, internal notes, assignment, tags, merge, canned responses, status/priority controls.
- **Customer 360 panel (core requirement)** — a single right-hand panel on every ticket showing:
  - **Airtable client record** — company, plan, supplier integrations, key contacts, sites.
  - **TG B2B CRM** — care-programme status, health flag, last/next care touch, open deals. The CRM (repo `tg-b2b-crm`, Projects row `rec1yoddf4IwqaPGi`) is in build; define a typed read interface in `src/lib/integrations/crm-seam.ts` now and stub it until the CRM exposes data.
  - **Luna Chat** — install status and recent conversation volume.
  - **Luna Marketing** — recent campaign engagement (opens/clicks) via a read seam.
  - **Support history** — open/recent tickets, lifetime CSAT, integration errors last 7 days.
- **Outbound to the CRM:** on ticket close, push a support signal to the CRM customer record (volume trend, sentiment, last issue summary) so support feeds the churn early-warning system. Stub behind the same seam until the CRM is ready.
- **Copilot** (reuse `luna-copilot` patterns): draft reply, rephrase, summarise thread, translate.
- **CSAT** — one-tap email/widget survey on resolve; score lands on the ticket and in analytics.

---

## 8. Self-improvement loop

1. When a **human** resolves an escalated ticket, the AI drafts a KB article candidate from the resolution → `kb_articles.status = review`.
2. **Review queue** in the app: Andy/agents approve, edit, or bin. Published articles are embedded immediately and start answering the next ticket.
3. **Weekly gap digest** (email or in-app): AI resolution rate trend, top escalation reasons, intents with repeated failures, KB candidates waiting for review.

KB seeding at launch: existing Knowledge Bot Airtable KB + scan of the current support site. No Zendesk import in Phase 1 (decided 12 Jun 2026) — revisit importing solutions/historic tickets once the desk is live and the queue is visible. Embed everything; mark provenance in `source`.

## 9. Analytics

Dashboard at `/analytics`: true AI resolution rate (definition in Goals), resolution by intent/category, first-response and full-resolution times, SLA compliance, CSAT (AI-resolved vs human-resolved, separately), escalation-reason breakdown, ticket volume by client (top 10 — feeds the CRM care conversation). All derivable from `tickets` + `ai_events` — no third-party analytics tool.

---

## 10. Security & compliance (ship-blockers, per travelgenix-security)

- No secrets client-side, ever. Anthropic/Supabase service keys live in Vercel env only; all AI calls via server routes.
- Rate limiting on every public endpoint (widget chat, portal submission, CSAT, inbound webhook). Inbound email path validates sender and webhook signatures; fail closed.
- Every rendered message body sanitised (tickets are hostile input — email HTML especially). Attachments: allowlisted types, size caps, served via signed URLs, never inline-executed.
- Supabase RLS on every table, keyed by tenant + role. Agent routes verify the SSO session server-side on every request.
- Least-privilege tokens: Airtable PAT scoped to the Clients base read-only; Supabase service key never reaches the browser.
- Audit log for every AI action tool call and every admin action.
- GDPR: per-client data export and delete; PII minimisation in `ai_events`; no customer PII in prompts beyond what the ticket requires.
- Full pre-deploy checklist from the security skill before every phase ships.

---

## 11. Phasing

**Phase 1 — Core loop (the trial slice).** Supabase schema + RLS; email-to-ticket; AI resolution loop with the three Phase 1 tools; agent inbox + ticket view (no 360 panel yet); KB ingest + review queue (seeded); send replies by email. **Exit test:** real tickets to `support@` are answered by the AI, escalations are worked entirely inside the app, Zendesk untouched for new tickets during a parallel run.

**Phase 2 — Channels + 360.** In-dashboard widget channel (SSO identity); Customer 360 panel with Airtable live + CRM/Luna seams stubbed; copilot; CSAT; SLA policies + breach view; analytics v1.

**Phase 3 — The differentiator.** Diagnostic tools (integration error feed, deeplink validation, endpoint health); gated action tools + audit; self-improvement loop automated; weekly digest; public KB portal.

**Phase 4 — Expansion.** WhatsApp via 360dialog; CRM two-way sync live (signals out, care status in); multi-tenant settings surface; Zendesk cancelled.

Each phase ends with: security checklist pass, eval harness pass, Projects Airtable row updated.

---

## 12. Open questions for Andy

**Answered 12 Jun 2026 (Phase 1 unblocked):**
1. **Product name:** TG Support Desk confirmed. ("Luna Desk" stays reserved as a CRM name candidate.)
2. **Mailbox:** `support@` on Google Workspace — confirms Gmail API polling for Phase 1.
3. **Incumbent platform:** Zendesk, not Freshdesk (brief corrected throughout). No export — the desk starts clean; importing solutions/historic tickets is reassessed against the live support queue once the desk is built.
4. **Agents:** 3+ seats; names/emails to follow before the parallel run.

**Non-blocking, still open:**
5. SLA targets per priority (proposed defaults: P1 first response 1h / resolve 8h; P2 4h/24h; P3 8h/72h — business hours, AI responds instantly regardless).
6. Parallel-run length before Zendesk is cancelled (proposed: 4 weeks or 200 tickets, whichever is later).
7. Default ticket categories/tags (no export to mine — propose starting minimal and letting the weekly gap digest surface categories).
