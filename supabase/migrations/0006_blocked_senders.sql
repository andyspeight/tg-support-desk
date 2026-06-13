-- Spam controls: a managed blocklist of senders/domains. Matching inbound
-- mail is dropped before a ticket is created. Service-role only (RLS on, no
-- policies) — managed via the authenticated settings UI.
create table blocked_senders (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  pattern text not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (tenant_id, pattern)
);

alter table blocked_senders enable row level security;
