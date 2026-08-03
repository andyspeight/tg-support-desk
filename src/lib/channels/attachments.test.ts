import { describe, expect, it } from "vitest";
import {
  checkAttachment,
  contentMatches,
  effectiveMimeType,
  safeFilename,
  sniffMime,
  storageKeyFor,
  wasInferred,
  MAX_ATTACHMENT_BYTES,
} from "./attachment-rules";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0]); // "MZ" — Windows executable

describe("effectiveMimeType (Outlook sends screenshots as octet-stream)", () => {
  it("resolves a generic type from the filename", () => {
    // The real blocked files: image001.png / image002.jpg from Outlook.
    expect(effectiveMimeType("image001.png", "application/octet-stream")).toBe("image/png");
    expect(effectiveMimeType("image002.jpg", "application/octet-stream")).toBe("image/jpeg");
    expect(effectiveMimeType("report.pdf", "")).toBe("application/pdf");
  });

  it("never overrides a specific declared type", () => {
    expect(effectiveMimeType("thing.png", "application/pdf")).toBe("application/pdf");
    expect(effectiveMimeType("evil.png", "text/html")).toBe("text/html");
  });

  it("leaves an unknown extension to fail the allowlist", () => {
    expect(effectiveMimeType("payload.exe", "application/octet-stream")).toBe("application/octet-stream");
    expect(checkAttachment({ mimeType: "application/octet-stream", size: 10, filename: "payload.exe" }).ok).toBe(false);
    expect(checkAttachment({ mimeType: "application/octet-stream", size: 10, filename: "run.sh" }).ok).toBe(false);
  });

  it("accepts the previously-blocked screenshots", () => {
    expect(checkAttachment({ mimeType: "application/octet-stream", size: 312550, filename: "image001.jpg" })).toEqual({ ok: true });
  });

  it("still enforces the size cap on an inferred type", () => {
    const r = checkAttachment({ mimeType: "application/octet-stream", size: MAX_ATTACHMENT_BYTES + 1, filename: "big.png" });
    expect(r.ok).toBe(false);
  });

  it("flags only the inferred case", () => {
    expect(wasInferred("image001.png", "application/octet-stream")).toBe(true);
    expect(wasInferred("image001.png", "image/png")).toBe(false);
    expect(wasInferred("payload.exe", "application/octet-stream")).toBe(false);
  });
});

describe("content verification (only where we trusted the filename)", () => {
  it("detects real formats from their leading bytes", () => {
    expect(sniffMime(png)).toBe("image/png");
    expect(sniffMime(jpeg)).toBe("image/jpeg");
    expect(sniffMime(exe)).toBeNull();
  });

  it("accepts an image whose bytes match its name", () => {
    expect(contentMatches("image/png", png)).toBe(true);
    expect(contentMatches("image/jpeg", jpeg)).toBe(true);
  });

  it("rejects an executable renamed as a screenshot", () => {
    expect(contentMatches("image/png", exe)).toBe(false);
    expect(contentMatches("image/png", jpeg)).toBe(false);
  });

  it("lets signature-less types (text, Office) through as before", () => {
    expect(contentMatches("text/csv", new Uint8Array([0x61, 0x2c, 0x62]))).toBe(true);
  });
});

describe("checkAttachment", () => {
  it("allows allowlisted types within the cap", () => {
    expect(checkAttachment({ mimeType: "application/pdf", size: 1024 })).toEqual({ ok: true });
    expect(checkAttachment({ mimeType: "image/PNG".toLowerCase(), size: 5000 })).toEqual({ ok: true });
  });

  it("rejects disallowed types", () => {
    const r = checkAttachment({ mimeType: "application/x-msdownload", size: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/type not allowed/);
  });

  it("rejects executables and scripts even if size is fine", () => {
    expect(checkAttachment({ mimeType: "text/html", size: 10 }).ok).toBe(false);
    expect(checkAttachment({ mimeType: "application/zip", size: 10 }).ok).toBe(false);
  });

  it("rejects oversize files", () => {
    const r = checkAttachment({ mimeType: "application/pdf", size: MAX_ATTACHMENT_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/too large/);
  });
});

describe("safeFilename", () => {
  it("strips path traversal and unsafe characters", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("my invoice (final).pdf")).toBe("my_invoice__final_.pdf");
    expect(safeFilename("..")).toBe("file");
    expect(safeFilename("C:\\Windows\\evil.exe")).toBe("evil.exe");
  });
});

describe("storageKeyFor", () => {
  it("scopes the key by tenant/ticket/message and sanitises the name", () => {
    const key = storageKeyFor("travelgenix", "ticket-1", "msg-1", 2, "../report.csv");
    expect(key).toBe("travelgenix/ticket-1/msg-1/2-report.csv");
  });
});
