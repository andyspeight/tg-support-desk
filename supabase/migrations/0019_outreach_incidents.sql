-- Proactive supplier-outage outreach. The team (or, later, the integration-error
-- feed) raises an "incident"; the AI drafts an on-brand heads-up; sending fans it
-- out to one ticket + email per affected client so a client's reply threads back
-- into the desk and the normal AI/agent flow picks it up.
--   status: open (raised, not yet sent) | sent | dismissed
--   source: manual (raised by a human) | error_feed (Phase 3 auto-detection)
-- Service-role only (RLS on, no policies) — managed via the authenticated app.
create table if not exists outreach_incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  supplier text not null,
  summary text not null,
  detail text,
  draft_message text,
  recipients jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  source text not null default 'manual',
  created_by text,
  sent_at timestamptz,
  sent_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_incidents_tenant_status_idx
  on outreach_incidents (tenant_id, status, created_at desc);

alter table outreach_incidents enable row level security;
