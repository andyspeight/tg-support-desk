-- Per-company switch for portal ticket visibility.
-- Default (no row, or false): everyone at the company sees all its tickets —
-- the long-standing behaviour. Turn it on for a company and the per-person
-- grant in company_members.can_see_all_tickets starts to apply: own tickets
-- only, unless someone is explicitly given the company-wide view.
--
-- Applied to project fpgfeqbxywwufagctzwj via MCP.
create table if not exists company_settings (
  tenant_id text not null default 'travelgenix',
  client_id text not null,
  client_name text,
  restrict_ticket_visibility boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, client_id)
);

-- Service-role only, like the other desk tables: RLS on, no policies.
alter table company_settings enable row level security;

comment on table company_settings is
  'Per-client-company portal settings. restrict_ticket_visibility=false (or no row) means everyone at the company sees all its tickets.';
