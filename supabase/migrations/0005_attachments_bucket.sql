-- Private bucket for inbound ticket attachments. No RLS policies on
-- storage.objects → service role only; all access is via auth-gated
-- server routes that mint short-lived signed URLs. 25 MB backstop cap
-- (the app enforces a tighter allowlist + cap before upload).
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)
on conflict (id) do nothing;
