// Safety net for the "Want to know more?" links. The resolution agent is told
// to copy a lesson's Source link verbatim from search_kb — this strips any line
// carrying a university.travelgenix.io link we did NOT actually retrieve, so a
// hallucinated source link can never reach a customer. Other URLs (embed
// snippets, deeplink examples that legitimately come out of the KB) pass
// through untouched — we only police the source domain.
const UNIVERSITY_URL = /https?:\/\/university\.travelgenix\.io[^\s<>()\]]*/gi;

function normalise(url: string): string {
  return url
    .replace(/[.,;:!?]+$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function sanitiseReplyLinks(body: string, allowed: Iterable<string>): string {
  const allow = new Set([...allowed].map(normalise));
  const kept = body.split("\n").filter((line) => {
    const urls = line.match(UNIVERSITY_URL);
    if (!urls) return true; // no University link on this line — keep it
    return urls.every((u) => allow.has(normalise(u))); // drop the line if any link is unknown
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
