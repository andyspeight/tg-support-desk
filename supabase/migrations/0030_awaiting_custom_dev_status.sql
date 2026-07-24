-- "Awaiting Custom Development" ticket status — the ticket is parked while a
-- bespoke build/change is in progress for the client. Like Awaiting Supplier
-- and Pending, it's an *active* status (lives in the open queues), not resolved.
-- Additive: adding an enum value doesn't reference it, so this is safe to apply
-- on its own. Applied to project fpgfeqbxywwufagctzwj via MCP.

alter type ticket_status add value if not exists 'awaiting_custom_dev';
