-- Corporate-domain → company links: the domain-level companion to company_members.
-- When staff link a person at a corporate domain to a company, the whole domain is
-- associated so colleagues auto-resolve without manual linking. Free-mail domains
-- are NEVER stored here (guarded in application code via FREE_MAIL_DOMAINS). An
-- individual company_members row (link or "no company" block) always overrides a
-- domain link, so ex-employees and per-person exceptions still win.

create table if not exists company_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'travelgenix' references tenants(id),
  domain text not null,
  client_id text,
  client_name text,
  source text not null default 'manual',
  created_by text,
  created_at timestamptz not null default now(),
  unique (tenant_id, domain)
);
create index if not exists company_domains_client_idx on company_domains (tenant_id, client_id);

-- Service-role only, mirroring company_members (the app uses the service key).
alter table company_domains enable row level security;

-- Backfill a domain's un-stamped tickets onto its company. Exact-domain match via
-- split_part (so a subdomain never matches), never overwrites an already-set
-- client_id, and EXCLUDES any address that has its own company_members row — so a
-- colleague with an individual link or an explicit "no company" block is never
-- swept up by the domain. Returns the number of tickets stamped.
create or replace function stamp_tickets_for_domain(p_tenant_id text, p_domain text, p_client_id text)
returns integer
language sql
security invoker
set search_path = public
as $$
  with updated as (
    update tickets t
    set client_id = p_client_id
    where t.tenant_id = p_tenant_id
      and t.client_id is null
      and split_part(lower(t.requester_email), '@', 2) = lower(p_domain)
      and lower(t.requester_email) not in (
        select cm.email from company_members cm where cm.tenant_id = p_tenant_id
      )
    returning 1
  )
  select coalesce(count(*), 0)::int from updated;
$$;
