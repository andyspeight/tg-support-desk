"use client";

import { useRef, useState } from "react";
import { Paperclip, Upload, X } from "lucide-react";

const ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
const MAX_FILES = 5;
const MAX_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * Drag-and-drop attachment picker with chips. Keeps a hidden <input name>
 * in sync (via DataTransfer) so it works inside a plain <form action>, and also
 * reports files through onFilesChange for forms that build FormData by hand.
 */
export function AttachmentPicker({
  name = "files",
  onFilesChange,
}: {
  name?: string;
  onFilesChange?: (files: File[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function apply(next: File[]) {
    const capped = next.slice(0, MAX_FILES);
    setFiles(capped);
    onFilesChange?.(capped);
    if (inputRef.current) {
      const dt = new DataTransfer();
      capped.forEach((f) => dt.items.add(f));
      inputRef.current.files = dt.files;
    }
  }

  function add(list: FileList | null) {
    if (!list) return;
    setError(null);
    const incoming = Array.from(list);
    const tooBig = incoming.find((f) => f.size > MAX_BYTES);
    if (tooBig) setError(`“${tooBig.name}” is over the 25 MB limit.`);
    const merged = [...files];
    for (const f of incoming) {
      if (f.size > MAX_BYTES) continue;
      if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
    }
    if (merged.length > MAX_FILES) setError(`Up to ${MAX_FILES} files.`);
    apply(merged);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        name={name}
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30 ${
          dragging ? "border-accent-400 bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300" : "border-line text-ink-3 hover:border-ink-3"
        }`}
      >
        <Upload className="h-4 w-4" strokeWidth={1.75} />
        Drag files here, or <span className="font-medium text-ink-2">browse</span>
      </button>

      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
            >
              <Paperclip className="h-3 w-3 text-ink-3" strokeWidth={1.75} />
              <span className="max-w-[160px] truncate">{f.name}</span>
              <span className="text-ink-3">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => apply(files.filter((_, j) => j !== i))}
                aria-label={`Remove ${f.name}`}
                className="text-ink-3 hover:text-red-600 dark:hover:text-red-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
