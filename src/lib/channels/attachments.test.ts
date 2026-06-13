import { describe, expect, it } from "vitest";
import { checkAttachment, safeFilename, storageKeyFor, MAX_ATTACHMENT_BYTES } from "./attachment-rules";

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
