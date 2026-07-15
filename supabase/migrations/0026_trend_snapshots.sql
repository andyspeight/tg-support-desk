-- Latest computed insights snapshot per tenant. One row per tenant, overwritten
-- each run by the detect-trends cron. The Insights page and the inbox trends
-- banner read this rather than recomputing (the AI clustering call is the
-- expensive part). Service-role only (RLS on, no policies).
create table if not exists trend_snapshots (
  tenant_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);

alter table trend_snapshots enable row level security;
