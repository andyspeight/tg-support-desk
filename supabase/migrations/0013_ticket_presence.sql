-- Stage 2: ticket presence (collision detection). A lightweight heartbeat table
-- so two agents opening the same ticket each see a "someone else is here" bar.
-- The desk has no browser-side Supabase connection (service role only), so we
-- poll: each open ticket view upserts the viewer's row and reads back the others.
-- Applied to project fpgfeqbxywwufagctzwj via MCP. Additive (nothing dropped).

create table if not exists ticket_presence (
  ticket_id uuid not null references tickets(id) on delete cascade,
  tenant_id text not null default 'travelgenix' references tenants(id),
  agent_email text not null,
  agent_name text,
  last_seen timestamptz not null default now(),
  primary key (ticket_id, agent_email)
);

create index if not exists ticket_presence_ticket_idx on ticket_presence (ticket_id, last_seen desc);

alter table ticket_presence enable row level security;

-- The app reads/writes via the service role; this policy mirrors the existing
-- tenant + app_role = 'agent' pattern for defence in depth.
create policy agent_read_presence on ticket_presence for select to authenticated
  using (tenant_id = coalesce(auth.jwt()->>'tenant_id','') and coalesce(auth.jwt()->>'app_role','') = 'agent');
