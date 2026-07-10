-- Bulk proactive outreach (e.g. "to all clients", ~300 recipients) is sent by a
-- paced background drainer rather than one synchronous request, to stay within
-- Gmail's send-rate limit and a single function's time budget. done_emails tracks
-- which recipients have been attempted so a run is resumable and can't double-send;
-- status gains 'sending' (open → sending → sent). Small sends stay inline.
alter table outreach_incidents
  add column if not exists done_emails jsonb not null default '[]'::jsonb;
