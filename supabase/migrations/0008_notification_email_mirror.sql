-- Email mirror of notifications: track whether each one has been emailed to the
-- recipient, so the notify-email cron sends each at most once. Additive.
-- Applied to project fpgfeqbxywwufagctzwj via MCP.
alter table notifications add column if not exists emailed_at timestamptz;

create index if not exists notifications_unemailed_idx
  on notifications (tenant_id, created_at)
  where emailed_at is null;
