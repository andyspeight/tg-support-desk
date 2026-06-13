# TG Support Desk — Operational Runbook

How the desk runs day to day, and what to do when something breaks. Companion
to [AGENTS.md](../AGENTS.md) (architecture) and
[DEVELOPMENT-PLAN.md](./DEVELOPMENT-PLAN.md) (roadmap).

## How a ticket flows

1. **Vercel cron** hits `/api/cron/poll-gmail` every minute (auth: `CRON_SECRET`).
2. **Ingest** (`pollGmailInbox` → `ingestGmailMessage`): blocklisted senders are
   dropped; auto-replies/bounces are stored but not answered; verified senders
   become tickets/messages; allowlisted attachments are stored privately.
3. **Resolve** (`resolveTicket`): loop guard → triage (intent/priority/language)
   → mandatory-escalation guardrails → AI agent loop (KB, client context, past
   tickets) → one terminal state: **answered**, **clarifying question**, or
   **escalated** (handover note + holding reply).
4. **Agents** work the AI-escalated and Breaching-SLA views; copilot assists;
   CSAT fires on resolve; analytics + audit log record everything.

## Daily checks (agent / Andy)

- **/dashboard** — open, escalated, waiting, **Breaching SLA**, AI resolution
  rate, top escalation causes. Anything in Breaching SLA is worked first.
- **/analytics** — weekly: AI resolution trend vs the 70% target, resolution by
  intent (which categories are losing), escalation Pareto (the top two are the
  week's KB/tooling targets), CSAT (AI vs human).
- **/kb** review queue — approve/edit/bin AI-drafted candidates; publishing
  embeds immediately.

## Incident playbook

| Symptom | Likely cause | Action |
|---|---|---|
| No new tickets appearing | Cron not firing, or Gmail auth expired | Vercel → project → Crons shows last run; check `/api/cron/poll-gmail` logs; re-auth Gmail (refresh token) if 401s in logs. |
| Tickets created but no AI reply | `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` missing or erroring | Check function logs for the resolve route; tickets fail-safe-escalate (status `escalated`, handover note `pipeline_error`) — they're not lost, just need a human until keys are fixed. |
| AI replying to an auto-responder / loop | Header detection missed an unusual responder | Loop guard caps at 5 AI replies/24h then escalates; add the sender to the blocklist in **Settings → Blocked senders**. |
| Wrong/poor answers on a topic | KB gap or stale article | Find the intent in /analytics → write/fix the KB article → publish (re-embeds). Add the failing case to `src/lib/ai/eval/`. |
| Attachment won't download | Not stored (blocked type/oversize) or signed-URL error | Blocked items show struck-through with a reason; check `storeAttachments` logs for storage errors. |
| Customer can't sign in to the desk | Not on `.travelify.io`, or not in `AGENT_EMAILS` | The `tg_session` cookie is domain-scoped — the app must be served from a `.travelify.io` subdomain; add the agent to `AGENT_EMAILS`. |
| A reply went out with a commercial promise | Outbound guardrail gap | Outbound guardrail blocks refund/credit/discount language → escalates instead; if one slipped, capture the wording as a new guardrail pattern + eval case. |

## Guardrails that must never be removed

- Inbound: commercial/billing/legal/human-request topics escalate before the
  model runs. Outbound: no refund/credit/discount commitments are ever sent.
- Sender verification fails **closed** (DMARC fail → escalate, don't auto-answer).
- All AI tool calls and admin actions are written to `audit_log`.
- Tune guardrail patterns with eval cases — never delete a guardrail class to
  reduce false escalations.

## Parallel-run procedure (Stage 1 → cancellation)

- New tickets → the desk; legacy/open tickets finish in Zendesk. No import.
- Zendesk cancellation gate (all must hold): ≥4 weeks parallel **and** ≥200
  tickets **and** ≥50% true AI resolution **and** agent sign-off **and** no
  Sev-1 incidents.

## Deploy & rollback

- Push to `main` → Vercel auto-deploys (team `agendasgroup`). Pre-merge gate:
  `npm test`, `npm run build`, `npm run lint`, and `npm run eval` for any
  prompt/tool change.
- Rollback: Vercel → Deployments → promote the last good deployment. DB
  migrations are forward-only; a bad migration is fixed with a new migration.
- Schema changes: add a `supabase/migrations/NNNN_*.sql`, apply, then
  regenerate `src/lib/db/database.types.ts`. Run the security advisors after
  any DDL.

## Pending ops hardening (needs live channel/credentials)

- Cron-failure + error-rate alerting to a Slack/email channel.
- Agent notifications (assignment, escalation, imminent SLA breach).
- Realtime inbox + collision detection (Supabase Realtime JWT minted from SSO).
