-- Hold unknown-sender tickets for human approval before the AI engages (spam
-- gate). Distinct from 'pending' (agent on-hold). Deliberately NOT added to the
-- open-status lists or tickets_awaiting_response, so held tickets stay out of
-- the working queue, stats, and the stale-agent sweep until approved.
alter type ticket_status add value if not exists 'awaiting_approval';
