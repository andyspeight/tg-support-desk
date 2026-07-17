import { describe, it, expect } from "vitest";
import { extractInlineImages } from "./inline-images";

// A 1x1 transparent PNG.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("extractInlineImages", () => {
  it("turns a data-URL image into a cid reference and decodes the bytes", () => {
    const { html, images } = extractInlineImages(`<p>Hi</p><img src="data:image/png;base64,${PNG_B64}">`);
    expect(images).toHaveLength(1);
    expect(images[0].mimeType).toBe("image/png");
    expect(images[0].filename).toBe("image-1.png");
    expect(images[0].content.length).toBeGreaterThan(0);
    expect(html).toContain(`cid:${images[0].cid}`);
    expect(html).not.toContain("data:image");
  });

  it("leaves ordinary HTML (and cid/remote images) untouched", () => {
    const src = `<p>No images here</p><img src="cid:already@x"><img src="https://x/y.png">`;
    const { html, images } = extractInlineImages(src);
    expect(images).toHaveLength(0);
    expect(html).toBe(src);
  });

  it("handles several images with distinct cids", () => {
    const { images } = extractInlineImages(
      `<img src="data:image/png;base64,${PNG_B64}"><img src="data:image/gif;base64,${PNG_B64}">`,
    );
    expect(images).toHaveLength(2);
    expect(new Set(images.map((i) => i.cid)).size).toBe(2);
    expect(images[1].filename).toBe("image-2.gif");
  });

  it("caps how many it extracts and leaves the overflow in place", () => {
    const one = `<img src="data:image/png;base64,${PNG_B64}">`;
    const { html, images } = extractInlineImages(one.repeat(4), 2);
    expect(images).toHaveLength(2);
    // The two overflow images stay as data URLs (the sanitiser drops them later).
    expect((html.match(/data:image/g) ?? []).length).toBe(2);
  });
});
