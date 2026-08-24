import { describe, expect, it } from "vitest";
import { imageFilesFrom, nameClipboardImages } from "./clipboard-images";

// Minimal DataTransfer stand-ins — jsdom's clipboard objects aren't constructible.
function dt(opts: { files?: File[]; items?: { kind: string; type: string; file?: File }[] }) {
  return {
    files: opts.files ?? [],
    items: (opts.items ?? []).map((i) => ({ ...i, getAsFile: () => i.file ?? null })),
  } as unknown as DataTransfer;
}
const img = (name: string, type = "image/png") => new File([new Uint8Array([1, 2, 3])], name, { type });

describe("imageFilesFrom", () => {
  it("takes images from a drop's file list", () => {
    const files = imageFilesFrom(dt({ files: [img("shot.png"), img("doc.pdf", "application/pdf")] }));
    expect(files.map((f) => f.name)).toEqual(["shot.png"]);
  });

  it("falls back to clipboard items when there are no files (the Ctrl+V case)", () => {
    const pasted = img("", "image/png");
    const files = imageFilesFrom(dt({ items: [{ kind: "file", type: "image/png", file: pasted }] }));
    expect(files).toHaveLength(1);
  });

  it("ignores non-images and plain text pastes", () => {
    expect(imageFilesFrom(dt({ items: [{ kind: "string", type: "text/plain" }] }))).toEqual([]);
    expect(imageFilesFrom(dt({ files: [img("notes.txt", "text/plain")] }))).toEqual([]);
  });

  it("is safe with no clipboard data", () => {
    expect(imageFilesFrom(null)).toEqual([]);
  });
});

describe("nameClipboardImages", () => {
  it("names unnamed clipboard images distinctly", () => {
    let n = 0;
    const out = nameClipboardImages([img(""), img("")], () => (n += 1));
    expect(out.map((f) => f.name)).toEqual(["pasted-image-1.png", "pasted-image-2.png"]);
  });

  it("leaves a real filename alone", () => {
    const out = nameClipboardImages([img("Screenshot 2026-08-24.png")], () => 1);
    expect(out[0].name).toBe("Screenshot 2026-08-24.png");
  });
});
