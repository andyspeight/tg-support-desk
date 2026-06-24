-- Outcome attribution: which published KB article was surfaced to (and cited
-- on) which ticket. Lets us measure article effectiveness — resolve rate and
-- CSAT of the tickets each article actually answered — and flag stale or
-- harmful articles for revision. The self-correcting half of the KB loop.
--
-- Service-role only (RLS on, no policies), like blocked_senders: written by the
-- resolution pipeline, read server-side by the KB view and weekly digest.
create table kb_article_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  article_id uuid not null references kb_articles(id) on delete cascade,
  ticket_id uuid not null references tickets(id) on delete cascade,
  cited boolean not null default false,
  created_at timestamptz not null default now(),
  unique (article_id, ticket_id)
);

create index kb_article_usage_article_idx on kb_article_usage (article_id);
create index kb_article_usage_ticket_idx on kb_article_usage (ticket_id);

alter table kb_article_usage enable row level security;
