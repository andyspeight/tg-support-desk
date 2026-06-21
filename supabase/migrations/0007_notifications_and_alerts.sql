-- Stage 2: agent notifications/alerts spine + ownership helpers.
-- Applied to project fpgfeqbxywwufagctzwj via MCP. All additive (nothing dropped).
-- In-app notifications first; the email mirror is added when Gmail lands.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  recipient text not null,                 -- agent email
  type text not null,                      -- assigned|customer_reply|escalated|mention|stale|snooze_due
  ticket_id uuid references tickets(id) on delete cascade,
  title text not null,
  body text,
  actor text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on notifications (tenant_id, recipient, read_at, created_at desc);
create index if not exists notifications_ticket_idx on notifications (ticket_id);

alter table notifications enable row level security;

-- Agent read access mirrors the existing tenant + app_role pattern; the app
-- (service role) additionally scopes every read to recipient = the agent.
create policy agent_read_notifications on notifications for select to authenticated
  using (tenant_id = coalesce(auth.jwt()->>'tenant_id','') and coalesce(auth.jwt()->>'app_role','') = 'agent');

alter publication supabase_realtime add table notifications;

-- Ownership niceties on tickets (additive).
alter table tickets add column if not exists watchers text[] not null default '{}';
alter table tickets add column if not exists snoozed_until timestamptz;

-- Open tickets whose latest message is from the customer (i.e. awaiting an
-- agent/AI reply). Internal notes and system messages do not count as replies.
-- Powers the inbox "waiting Nh" badge and the stale-ticket cron.
create or replace function tickets_awaiting_response(p_tenant_id text default 'travelgenix')
returns table (ticket_id uuid, waiting_since timestamptz)
language sql stable
set search_path = public
as $$
  select t.id, m.last_customer
  from tickets t
  join lateral (
    select max(created_at) filter (where role = 'customer') as last_customer,
           max(created_at) filter (where role in ('ai','human')) as last_reply
    from messages where ticket_id = t.id
  ) m on true
  where t.tenant_id = p_tenant_id
    and t.status in ('new','ai_working','waiting_on_customer','escalated')
    and m.last_customer is not null
    and (m.last_reply is null or m.last_reply < m.last_customer);
$$;
