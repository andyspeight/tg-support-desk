-- Source URL + content hash on KB articles: powers dedupe + freshness for
-- crawled sources (University, support-site scans) and "view original" links.
-- Additive. Applied via MCP.
alter table kb_articles add column if not exists source_url text;
alter table kb_articles add column if not exists source_hash text;
create index if not exists kb_articles_source_url_idx on kb_articles (tenant_id, source_url);
