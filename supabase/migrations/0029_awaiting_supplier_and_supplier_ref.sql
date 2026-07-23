-- "Awaiting Supplier" ticket status + a supplier ticket reference field.
--
-- Awaiting Supplier is the Zendesk-style "on-hold, waiting on a third-party"
-- state: the ticket is parked because we're blocked on a supplier, not resolved
-- and not waiting on the customer. It's an *active* status, so it lives in the
-- open queues alongside 'pending'.
--
-- supplier_ticket_ref holds the third party's own ticket/case number so staff
-- can find it at a glance instead of digging through internal notes.
--
-- Both statements are additive. Adding an enum value and adding a (nullable)
-- text column don't reference the new value, so this is safe to apply together.
-- Applied to project fpgfeqbxywwufagctzwj via MCP.

alter type ticket_status add value if not exists 'awaiting_supplier';

alter table tickets add column if not exists supplier_ticket_ref text;
