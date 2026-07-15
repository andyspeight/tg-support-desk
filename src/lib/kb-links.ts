// Shared helpers for referencing a KB article in a reply. Pure module (no
// server-only / no React) so both the server (building absolute URLs) and the
// client (inserting into the editor) can use it.

export type KbLinkRef = { title: string; url: string };

/** Window event used to insert a KB link into the reply editor from anywhere on
 *  the ticket page (the side-panel suggestions and the in-box picker both fire
 *  it; the ReplyBox listens). */
export const KB_INSERT_EVENT = "tg:insert-kb";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only http(s)/mailto survive as a link target; anything else (javascript:,
 *  data:, …) collapses to "#". Defense-in-depth for any stored/source URL that
 *  gets rendered into an href — React does not strip dangerous schemes. */
export function safeHttpUrl(url: string | null | undefined): string {
  const u = (url ?? "").trim();
  return /^(https?:\/\/|mailto:)/i.test(u) ? u : "#";
}

/** Public help-page URL for a published article. Absolute when a base URL is
 *  configured (so it works in emails); relative otherwise. */
export function buildKbHref(baseUrl: string | undefined, id: string): string {
  const base = (baseUrl ?? "").replace(/\/$/, "");
  return `${base}/kb/${id}`;
}

/** The best public link for an article: its canonical source (ingested help/blog
 *  content) when present, otherwise our hosted help page. */
export function kbBestUrl(baseUrl: string | undefined, item: { id: string; source_url: string | null }): string {
  return item.source_url || buildKbHref(baseUrl, item.id);
}

/** The snippet inserted into the reply when an agent picks an article. */
export function kbLinkHtml({ title, url }: KbLinkRef): string {
  return `<p>You might find this helpful: <a href="${escapeHtml(safeHttpUrl(url))}">${escapeHtml(title)}</a></p>`;
}

export function dispatchKbInsert(ref: KbLinkRef): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<KbLinkRef>(KB_INSERT_EVENT, { detail: ref }));
}
