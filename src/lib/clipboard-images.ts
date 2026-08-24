/**
 * Pasted and dropped images, shared by the agent composer and the client portal.
 *
 * People screenshot with Win+Shift+S or Cmd+Shift+4 and then press Ctrl+V —
 * they do not go looking for a Browse button. The agent composer has always
 * accepted that; the portal did not, and a plain <textarea> swallows a pasted
 * image silently, so clients believed they had sent screenshots that never
 * existed server-side (#8317: five replies saying "I've sent screenshots" with
 * zero files received).
 */

/** Image files carried by a paste or drop, from either files or items. */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromFiles = Array.from(data.files ?? []).filter((f) => f.type.startsWith("image/"));
  if (fromFiles.length > 0) return fromFiles;
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

/**
 * A clipboard image usually arrives with no filename. Give it one, numbered by
 * `seq` so several pastes in a row stay distinct (the picker de-dupes on
 * name+size, and two different screenshots can share a size).
 */
export function nameClipboardImages(files: File[], seq: () => number): File[] {
  return files.map((f) =>
    f.name ? f : new File([f], `pasted-image-${seq()}.${f.type.split("/")[1] || "png"}`, { type: f.type }),
  );
}
