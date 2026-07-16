-- Dedup marker for the CRM write-back: set once a resolved/escalated activity
-- for this ticket has been pushed to the B2B CRM timeline, so the hourly
-- crm-sync cron never logs it twice and can find the not-yet-pushed ones.
alter table tickets add column if not exists crm_activity_at timestamptz;
comment on column tickets.crm_activity_at is 'When a resolved/escalated activity for this ticket was pushed to the B2B CRM timeline (dedup marker for crm-sync).';
