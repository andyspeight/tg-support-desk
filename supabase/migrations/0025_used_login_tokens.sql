-- Atomic single-use record for portal magic-link sign-in tokens. Consuming a
-- token is an INSERT of its jti; a duplicate INSERT (already used) conflicts, so
-- single-use is enforced by the primary key rather than a racy check-then-write.
-- Service-role only (RLS on, no policies).
create table if not exists used_login_tokens (
  jti text primary key,
  email text not null,
  used_at timestamptz not null default now()
);

alter table used_login_tokens enable row level security;
