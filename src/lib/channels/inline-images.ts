// Pull base64 data-URL images out of composed reply HTML and turn them into
// cid-referenced inline images, so an image the agent pasted/dropped into the
// body is embedded inline in the outbound email (and stored so the ticket
// renders it) rather than stripped. Pure + unit-tested.

export type InlineImage = { cid: string; filename: string; mimeType: string; content: Buffer };

// <img ... src="data:image/png;base64,...."> — tolerant of other attributes and
// of whitespace inside the base64 payload. Restricted to the raster types on the
// attachment allowlist: never embed SVG (script-bearing) or other image types,
// since the outbound email path doesn't re-check these against the allowlist.
const DATA_IMG_RE = /<img\b[^>]*?\bsrc=["']data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\s]+?)["'][^>]*>/gi;

/**
 * Replace each inline data-URL image with `<img src="cid:...">` and return the
 * decoded images. Bounded (default 10) so a paste-bomb can't balloon a message;
 * any extras are left untouched for the HTML sanitiser to drop. Malformed data
 * URLs are left as-is (and then dropped downstream), never thrown.
 */
export function extractInlineImages(html: string, max = 10): { html: string; images: InlineImage[] } {
  const images: InlineImage[] = [];
  const out = html.replace(DATA_IMG_RE, (whole, mime: string, b64: string) => {
    if (images.length >= max) return whole;
    const content = Buffer.from(b64.replace(/\s+/g, ""), "base64");
    if (content.length === 0) return whole;
    const i = images.length + 1;
    const cid = `inline-image-${i}@tg-support`;
    const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
    images.push({ cid, filename: `image-${i}.${ext}`, mimeType: mime, content });
    return `<img src="cid:${cid}">`;
  });
  return { html: out, images };
}
