// Neutralise PostgREST `or()`-filter metacharacters in a user-supplied search
// term. PostgREST parses `,` `(` `)` as filter grammar and `%` `_` as LIKE
// wildcards, so an unescaped term could restructure the filter built in
// searchAll(). Pure + unit-tested so the guard can't silently regress.
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()\\"%_]/g, " ").replace(/\s+/g, " ").trim();
}
