-- Semantic search over resolved/closed tickets ("how was this handled before").
-- Kept in a side table so the hot tickets table stays lean (no 1024-float column
-- on every ticket read). Populated by the embed-tickets cron. Service-role only.
create table if not exists ticket_embeddings (
  ticket_id uuid primary key references tickets(id) on delete cascade,
  tenant_id text not null default 'travelgenix' references tenants(id),
  embedding vector(1024),
  updated_at timestamptz not null default now()
);

create index if not exists ticket_embeddings_vec_idx
  on ticket_embeddings using hnsw (embedding vector_cosine_ops);

alter table ticket_embeddings enable row level security;

create or replace function match_tickets(
  query_embedding vector,
  p_tenant text default 'travelgenix',
  match_count int default 6,
  min_similarity float default 0.3
)
returns table (
  ticket_id uuid,
  reference int,
  subject text,
  status ticket_status,
  resolved_at timestamptz,
  similarity float
)
language sql stable
set search_path = public, extensions
as $$
  select t.id, t.reference, t.subject, t.status, t.resolved_at,
         1 - (e.embedding <=> query_embedding) as similarity
  from ticket_embeddings e
  join tickets t on t.id = e.ticket_id
  where e.tenant_id = p_tenant
    and e.embedding is not null
    and 1 - (e.embedding <=> query_embedding) >= min_similarity
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
