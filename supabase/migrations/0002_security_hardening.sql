-- Security hardening per Supabase advisors (applied 12 Jun 2026):
-- pin function search_paths; move pgvector out of the public schema.
-- Remaining INFO-level advisors are intentional: audit_log and
-- channel_sync_state have RLS enabled with no policies (service-role only).

create schema if not exists extensions;
alter extension vector set schema extensions;

alter function public.set_updated_at() set search_path = public;
-- match_kb_articles uses the <=> operator from the vector extension, so its
-- pinned path must include the extensions schema.
alter function public.match_kb_articles(extensions.vector, int, text) set search_path = public, extensions;
alter function public.search_past_tickets(text, text, int, text) set search_path = public;
