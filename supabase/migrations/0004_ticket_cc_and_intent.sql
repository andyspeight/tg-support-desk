-- Stage 2: CC/multi-recipient capture + AI triage intent.
-- cc_emails: additional recipients carried through on replies.
-- intent: utility-model classification on ingest (powers analytics + routing).
alter table tickets add column if not exists cc_emails text[] not null default '{}';
alter table tickets add column if not exists intent text;

create index if not exists tickets_intent_idx on tickets (tenant_id, intent);
