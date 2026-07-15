-- Explicit user → company links, managed by Travelgenix in the desk. These
-- override the Airtable email/domain matching: a row with a client_id links the
-- email to that company (portal company view + ticket stamping); a row with a
-- NULL client_id explicitly detaches the email from every company (e.g. an
-- ex-employee whose @company.com address would otherwise domain-match).
-- Service-role only (RLS on, no policies) — managed via the settings UI.
create table if not exists company_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  email text not null,
  client_id text,
  client_name text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create index if not exists company_members_client_idx on company_members (tenant_id, client_id);

alter table company_members enable row level security;
