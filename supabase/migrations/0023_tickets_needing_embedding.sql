-- Resolved/closed tickets that don't yet have a semantic embedding — the work
-- list for the embed-tickets cron (which backfills existing ones and keeps up
-- with newly-resolved tickets).
create or replace function tickets_needing_embedding(
  p_tenant text default 'travelgenix',
  p_limit int default 40
)
returns table (id uuid, subject text)
language sql stable
set search_path = public
as $$
  select t.id, t.subject
  from tickets t
  left join ticket_embeddings e on e.ticket_id = t.id
  where t.tenant_id = p_tenant
    and t.status in ('resolved', 'closed')
    and e.ticket_id is null
  order by t.updated_at desc
  limit p_limit;
$$;
