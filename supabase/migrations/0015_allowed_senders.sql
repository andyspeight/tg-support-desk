-- Allow-list of known senders/domains (mirrors blocked_senders). A new inbound
-- email from a sender that is neither allow-listed nor a matched Airtable client
-- is held for human approval instead of being worked by the AI. Service-role
-- only (RLS on, no policies) — managed via the authenticated settings UI.
create table if not exists allowed_senders (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  pattern text not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (tenant_id, pattern)
);

alter table allowed_senders enable row level security;
