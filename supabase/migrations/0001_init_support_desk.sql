-- TG Support Desk — Phase 1 schema
-- Applied to project fpgfeqbxywwufagctzwj (eu-west-2) on 12 Jun 2026 via MCP.
-- All tables carry tenant_id (default 'travelgenix'); multi-tenant from day one.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ── Enums ────────────────────────────────────────────────────────────────────
create type ticket_status as enum ('new','ai_working','waiting_on_customer','escalated','resolved','closed');
create type ticket_channel as enum ('email','widget','portal','whatsapp');
create type ticket_priority as enum ('p1','p2','p3');
create type message_role as enum ('customer','ai','human','internal_note','system');
create type kb_status as enum ('draft','review','published','archived');
create type kb_source as enum ('manual','scan','ticket_mined','zendesk_import');
create type ai_outcome as enum ('answered','action_taken','escalated','clarified');
create type actor_type as enum ('ai','human','system');

-- ── Tenants ──────────────────────────────────────────────────────────────────
create table tenants (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- ── SLA policies ─────────────────────────────────────────────────────────────
create table sla_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  name text not null,
  priority ticket_priority not null,
  first_response_minutes integer not null,
  resolve_minutes integer not null,
  business_hours boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Tickets ──────────────────────────────────────────────────────────────────
create table tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  reference bigint generated always as identity,
  client_id text,
  requester_name text,
  requester_email text not null,
  channel ticket_channel not null default 'email',
  subject text not null default '(no subject)',
  status ticket_status not null default 'new',
  priority ticket_priority not null default 'p3',
  assignee text,
  tags text[] not null default '{}',
  sla_policy_id uuid references sla_policies(id),
  language text,
  email_thread_key text,
  first_response_at timestamptz,
  resolved_at timestamptz,
  ai_resolved boolean not null default false,
  escalation_reason text,
  csat_score smallint check (csat_score between 1 and 5),
  csat_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tickets_tenant_status_idx on tickets (tenant_id, status);
create index tickets_tenant_assignee_idx on tickets (tenant_id, assignee);
create index tickets_thread_key_idx on tickets (email_thread_key);
create index tickets_client_idx on tickets (client_id);
create index tickets_created_idx on tickets (tenant_id, created_at desc);
create unique index tickets_reference_idx on tickets (tenant_id, reference);

-- ── Messages ─────────────────────────────────────────────────────────────────
create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  ticket_id uuid not null references tickets(id) on delete cascade,
  role message_role not null,
  author text,
  body_text text not null default '',
  body_html text,
  channel_meta jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  body_fts tsvector generated always as (to_tsvector('english', left(body_text, 100000))) stored,
  created_at timestamptz not null default now()
);

create index messages_ticket_idx on messages (ticket_id, created_at);
create index messages_fts_idx on messages using gin (body_fts);

-- ── Knowledge base ───────────────────────────────────────────────────────────
create table kb_articles (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  title text not null,
  body text not null,
  source kb_source not null default 'manual',
  status kb_status not null default 'draft',
  embedding vector(1024),
  source_ticket_id uuid references tickets(id) on delete set null,
  created_by text,
  body_fts tsvector generated always as (to_tsvector('english', left(title || ' ' || body, 100000))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kb_articles_status_idx on kb_articles (tenant_id, status);
create index kb_articles_fts_idx on kb_articles using gin (body_fts);
create index kb_articles_embedding_idx on kb_articles using hnsw (embedding vector_cosine_ops);

-- ── AI events (powers analytics + improvement loop) ─────────────────────────
create table ai_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  ticket_id uuid not null references tickets(id) on delete cascade,
  turn integer not null default 1,
  model text,
  tools_called jsonb not null default '[]'::jsonb,
  confidence real,
  outcome ai_outcome not null,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index ai_events_ticket_idx on ai_events (ticket_id);
create index ai_events_tenant_created_idx on ai_events (tenant_id, created_at desc);

-- ── Canned responses / tags / audit ──────────────────────────────────────────
create table canned_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  title text not null,
  body text not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  name text not null,
  color text,
  unique (tenant_id, name)
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  actor_type actor_type not null,
  actor text not null,
  action text not null,
  target_type text,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_tenant_created_idx on audit_log (tenant_id, created_at desc);

-- ── Channel sync state (e.g. Gmail poll cursor / processed ids) ─────────────
create table channel_sync_state (
  tenant_id text not null default 'travelgenix' references tenants(id),
  channel ticket_channel not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, channel)
);

-- ── updated_at triggers ──────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger tickets_updated_at before update on tickets
  for each row execute function set_updated_at();
create trigger kb_articles_updated_at before update on kb_articles
  for each row execute function set_updated_at();
create trigger canned_responses_updated_at before update on canned_responses
  for each row execute function set_updated_at();

-- ── RAG: KB vector match ─────────────────────────────────────────────────────
create or replace function match_kb_articles(
  query_embedding vector(1024),
  match_count int default 5,
  p_tenant_id text default 'travelgenix'
)
returns table (id uuid, title text, body text, similarity float)
language sql stable as $$
  select k.id, k.title, k.body, 1 - (k.embedding <=> query_embedding) as similarity
  from kb_articles k
  where k.tenant_id = p_tenant_id
    and k.status = 'published'
    and k.embedding is not null
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

-- ── Resolved-ticket retrieval ("how was this solved before") ─────────────────
create or replace function search_past_tickets(
  query_text text,
  p_client_id text default null,
  match_count int default 5,
  p_tenant_id text default 'travelgenix'
)
returns table (ticket_id uuid, subject text, snippet text, resolved_at timestamptz, rank real)
language sql stable as $$
  select s.ticket_id, s.subject, s.snippet, s.resolved_at, s.rank from (
    select distinct on (t.id)
      t.id as ticket_id,
      t.subject,
      left(m.body_text, 500) as snippet,
      t.resolved_at,
      ts_rank(m.body_fts, websearch_to_tsquery('english', query_text)) as rank
    from tickets t
    join messages m on m.ticket_id = t.id
    where t.tenant_id = p_tenant_id
      and t.status in ('resolved','closed')
      and (p_client_id is null or t.client_id = p_client_id)
      and m.body_fts @@ websearch_to_tsquery('english', query_text)
    order by t.id, ts_rank(m.body_fts, websearch_to_tsquery('english', query_text)) desc
  ) s
  order by s.rank desc
  limit match_count;
$$;

-- ── RLS: enabled everywhere; service role bypasses. Agent read access is via
--    short-lived custom JWTs carrying tenant_id + app_role claims (realtime). ─
alter table tenants enable row level security;
alter table sla_policies enable row level security;
alter table tickets enable row level security;
alter table messages enable row level security;
alter table kb_articles enable row level security;
alter table ai_events enable row level security;
alter table canned_responses enable row level security;
alter table tags enable row level security;
alter table audit_log enable row level security;
alter table channel_sync_state enable row level security;

create policy agent_read_tenants on tenants for select to authenticated
  using (id = coalesce(auth.jwt()->>'tenant_id','') and coalesce(auth.jwt()->>'app_role','') = 'agent');
create policy agent_read_sla on sla_policies for select to authenticated
  using (tenant_id = coalesce(auth.jwt()->>'tenant_id','') and coalesce(auth.jwt()->>'app_role','') = 'agent');
create policy agent_read_tickets on tickets for select to authenticated
  using (tenant_id = coalesce(auth.jwt()->>'tenant_id','') and coalesce(auth.jwt()->>'app_role','') = 'agent');
create policy agent_read_messages on messages for select to authenticated
  using (tenant_id = coalesce(auth.jwt()->>'tenant_id','') and coalesce(auth.jwt()->>'app_role','') = 'agent');
create policy agent_read_kb on kb_articles for select to authenticated
  using (tenant_id = coalesce(auth.jwt()->>'tenant_id','') and coalesce(auth.jwt()->>'app_role','') = 'agent');
create policy agent_read_ai_events on ai_events for select to authenticated
  using (tenant_id = coalesce(auth.jwt()->>'tenant_id','') and coalesce(auth.jwt()->>'app_role','') = 'agent');
create policy agent_read_canned on canned_responses for select to authenticated
  using (tenant_id = coalesce(auth.jwt()->>'tenant_id','') and coalesce(auth.jwt()->>'app_role','') = 'agent');
create policy agent_read_tags on tags for select to authenticated
  using (tenant_id = coalesce(auth.jwt()->>'tenant_id','') and coalesce(auth.jwt()->>'app_role','') = 'agent');
-- audit_log + channel_sync_state: service-role access only (no policies).

-- ── Realtime for the live inbox ──────────────────────────────────────────────
alter publication supabase_realtime add table tickets;
alter publication supabase_realtime add table messages;

-- ── Seed ─────────────────────────────────────────────────────────────────────
insert into tenants (id, name) values ('travelgenix', 'Travelgenix');

insert into sla_policies (tenant_id, name, priority, first_response_minutes, resolve_minutes) values
  ('travelgenix', 'P1 — Urgent',   'p1',  60,  480),
  ('travelgenix', 'P2 — Standard', 'p2', 240, 1440),
  ('travelgenix', 'P3 — Low',      'p3', 480, 4320);

insert into tags (tenant_id, name, color) values
  ('travelgenix', 'supplier-integration', 'blue'),
  ('travelgenix', 'widget', 'green'),
  ('travelgenix', 'deeplinks', 'purple'),
  ('travelgenix', 'billing', 'red'),
  ('travelgenix', 'unverified-sender', 'orange');
