# TG Support Desk

AI-first support desk for Travelgenix's ~300 B2B clients, replacing Zendesk. Every inbound
ticket gets an AI first touch; humans only see tickets after the AI has tried, diagnosed and
prepared a handover.

**The canonical project brief is [AGENTS.md](./AGENTS.md)** — architecture, phasing, guardrails
and decisions live there. Live project state is tracked in the Projects Airtable row (see brief §0).

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4, deployed on Vercel (team `agendasgroup`)
- Supabase Postgres (`tg-support-desk`, eu-west-2) — tickets, messages, KB with pgvector, RLS everywhere
- Airtable Clients base — read-only source of truth for client identity
- Anthropic API (server-side only) — resolution agent on `claude-fable-5`; Voyage AI embeddings
- Gmail API polling on the `help@travelgenix.io` Workspace mailbox (every minute via Vercel cron)
- Auth: Travelgenix SSO (`tg_session` cookie) + `AGENT_EMAILS` seat allowlist

## Development

```bash
npm install
cp .env.example .env.local   # fill in secrets (see comments in the file)
npm run dev                  # app on http://localhost:3000
```

Set `AUTH_DEV_BYPASS=true` in `.env.local` to skip SSO locally (ignored in production).

| Command        | What it does                                              |
| -------------- | --------------------------------------------------------- |
| `npm run dev`  | Dev server                                                |
| `npm run build`| Production build + typecheck                              |
| `npm test`     | Unit tests (email parsing etc.)                           |
| `npm run eval` | AI eval harness — run before shipping prompt/tool changes |
| `npm run lint` | ESLint                                                    |

## How a ticket flows (Phase 1)

1. Vercel cron hits `/api/cron/poll-gmail` every minute → new Gmail messages become
   tickets/messages (threaded by Gmail thread id; quoted history and signatures stripped;
   sender verification fails closed).
2. `resolveTicket()` runs: deterministic guardrails first (commercial/legal/human-request
   topics escalate before the model sees them), then the agent loop with three tools —
   `search_kb` (pgvector RAG), `get_client_context` (Airtable), `search_past_tickets`.
3. Every run ends in exactly one state: **answered** (reply sent, ticket resolved),
   **clarifying question** (reply sent, waiting on customer), or **escalated** (handover
   package pinned as an internal note + holding reply). Never silent.
4. Agents work escalations in the inbox at `/inbox`; every AI tool call and admin action is
   written to `audit_log`; `ai_events` powers the resolution-rate analytics (Phase 2).

## Database

Schema lives in [`supabase/migrations/`](./supabase/migrations) and is applied to the
`tg-support-desk` Supabase project. After schema changes, regenerate
`src/lib/db/database.types.ts`.

## Deployment notes

- Vercel project env vars: see `.env.example` (everything is server-side; no `NEXT_PUBLIC_` secrets).
- `CRON_SECRET` must be set — Vercel sends it on cron requests and both API routes require it.
- Pre-deploy: `npm run build`, `npm test`, `npm run eval`, plus the security checklist in the
  brief (§10) before each phase ships.
