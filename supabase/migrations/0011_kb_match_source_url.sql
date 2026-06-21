-- match_kb_articles now also returns source_url, so the resolution agent can
-- offer a "Want to know more?" link to the original source (e.g. the University
-- lesson). Changing a RETURNS TABLE needs drop + recreate. Applied via MCP.
drop function if exists public.match_kb_articles(vector, integer, text);
create function public.match_kb_articles(query_embedding vector, match_count integer default 5, p_tenant_id text default 'travelgenix')
 returns table(id uuid, title text, body text, similarity double precision, source_url text)
 language sql stable
 set search_path to 'public', 'extensions'
as $$
  select k.id, k.title, k.body, 1 - (k.embedding <=> query_embedding) as similarity, k.source_url
  from kb_articles k
  where k.tenant_id = p_tenant_id
    and k.status = 'published'
    and k.embedding is not null
  order by k.embedding <=> query_embedding
  limit match_count;
$$;
