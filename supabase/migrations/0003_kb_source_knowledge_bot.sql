-- Provenance value for articles seeded from the Travelgenix Knowledge Bot
-- Airtable base (brief §8: mark provenance in kb_articles.source).
-- Applied 12 Jun 2026; followed by a one-off import of 171 Q&A articles
-- (status 'review') from base app6Ot3eOb3DangkB.
alter type kb_source add value if not exists 'knowledge_bot';
