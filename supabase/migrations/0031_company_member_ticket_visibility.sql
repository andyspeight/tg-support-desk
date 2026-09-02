-- Per-person portal visibility. Default false: a client sees only their own
-- tickets unless someone at Travelgenix deliberately grants the wider view.
--
-- Before this, anyone whose email resolved to a company — including via a
-- domain match they never asked for — could read every ticket that company had
-- raised. Company-wide sight is now an explicit grant recorded here.
-- Additive; applied to project fpgfeqbxywwufagctzwj via MCP.
alter table company_members
  add column if not exists can_see_all_tickets boolean not null default false;

comment on column company_members.can_see_all_tickets is
  'When true this person sees every ticket for their company in the portal. Default false = own tickets only.';
