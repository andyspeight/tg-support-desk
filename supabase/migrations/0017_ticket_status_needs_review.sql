-- Graduated autonomy: the AI always drafts an answer, but when it isn't
-- confident enough (or the intent isn't cleared for auto-send) it holds the
-- draft in 'needs_review' for a human to approve, edit and send — distinct from
-- 'escalated' (the AI couldn't answer) and from 'awaiting_approval' (spam gate).
alter type ticket_status add value if not exists 'needs_review';
