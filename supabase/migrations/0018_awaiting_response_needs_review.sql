-- A held AI draft ('needs_review') means the customer is still waiting for a
-- reply, so it counts as awaiting response (feeds the stale-ticket sweep). Unlike
-- 'awaiting_approval' (spam holding pen), which stays excluded.
create or replace function tickets_awaiting_response(p_tenant_id text default 'travelgenix')
returns table (ticket_id uuid, waiting_since timestamptz)
language sql stable
set search_path = public
as $$
  select t.id, m.last_customer
  from tickets t
  join lateral (
    select max(created_at) filter (where role = 'customer') as last_customer,
           max(created_at) filter (where role in ('ai','human')) as last_reply
    from messages where ticket_id = t.id
  ) m on true
  where t.tenant_id = p_tenant_id
    and t.status in ('new','ai_working','waiting_on_customer','escalated','needs_review')
    and m.last_customer is not null
    and (m.last_reply is null or m.last_reply < m.last_customer);
$$;
