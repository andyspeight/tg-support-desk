"use client";

import { useRef, useState, useTransition } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link2,
  Quote,
  Paperclip,
  Image as ImageIcon,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";

type CannedOption = { id: string; title: string; body: string };
type CopilotResult = { ok: true; text: string } | { ok: false; error: string };

type Props = {
  ticketId: string;
  canned: CannedOption[];
  sendReply: (formData: FormData) => Promise<void>;
  addNote: (formData: FormData) => Promise<void>;
  copilot?: {
    draft: (ticketId: string) => Promise<CopilotResult>;
    summarise: (ticketId: string) => Promise<CopilotResult>;
    rephrase: (text: string) => Promise<CopilotResult>;
    translate: (text: string, language: string) => Promise<CopilotResult>;
  };
};

const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
const FILE_ACCEPT =
  ".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,text/plain,text/csv";
const MAX_FILES = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("");
}
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition disabled:opacity-40 ${
        active ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function ReplyBox({ ticketId, canned, sendReply, addNote, copilot }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      Placeholder.configure({ placeholder: "Write a reply… (sent by email) or an internal note" }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "tg-prose min-h-[180px] max-h-[420px] overflow-y-auto px-3 py-2.5 text-sm text-ink focus:outline-none",
      },
    },
  });

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const incoming = Array.from(list);
    const tooBig = incoming.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) setError(`"${tooBig.name}" is over the 25 MB limit.`);
    setFiles((prev) => [...prev, ...incoming.filter((f) => f.size <= MAX_FILE_BYTES)].slice(0, MAX_FILES));
  }

  const isEmpty = !editor || editor.getText().trim() === "";

  function submit(action: (formData: FormData) => Promise<void>) {
    if (!editor || isPending) return;
    if (isEmpty && files.length === 0) return;
    const fd = new FormData();
    fd.set("ticketId", ticketId);
    fd.set("html", editor.getHTML());
    for (const f of files) fd.append("files", f);
    startTransition(async () => {
      await action(fd);
      editor.commands.clearContent();
      setFiles([]);
      setSummary(null);
    });
  }

  function runCopilot(label: string, fn: () => Promise<CopilotResult>, apply: (text: string) => void) {
    if (busy || !editor) return;
    setBusy(label);
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) apply(result.text);
      else setError(result.error);
      setBusy(null);
    });
  }

  const setLink = (ed: Editor) => {
    const prev = ed.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") ed.chain().focus().unsetLink().run();
    else ed.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm">
      {/* Copilot row */}
      {copilot && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft px-2.5 py-2 text-xs">
          <span className="flex items-center gap-1 font-medium text-accent-700 dark:text-accent-300">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} /> Copilot
          </span>
          <button
            onClick={() => runCopilot("draft", () => copilot.draft(ticketId), (t) => editor?.commands.setContent(textToHtml(t)))}
            disabled={!!busy || isPending}
            className="rounded border border-accent-200 bg-accent-50 px-2 py-1 text-accent-700 hover:bg-accent-100 disabled:opacity-40 dark:border-accent-500/25 dark:bg-accent-500/10 dark:text-accent-300 dark:hover:bg-accent-500/20"
          >
            {busy === "draft" ? "Drafting…" : "Draft reply"}
          </button>
          <button
            onClick={() => runCopilot("summary", () => copilot.summarise(ticketId), setSummary)}
            disabled={!!busy || isPending}
            className="rounded border border-line px-2 py-1 text-ink-2 hover:bg-surface-2 disabled:opacity-40"
          >
            {busy === "summary" ? "Summarising…" : "Summarise"}
          </button>
          <button
            onClick={() => editor && !isEmpty && runCopilot("rephrase", () => copilot.rephrase(editor.getText()), (t) => editor.commands.setContent(textToHtml(t)))}
            disabled={!!busy || isPending || isEmpty}
            className="rounded border border-line px-2 py-1 text-ink-2 hover:bg-surface-2 disabled:opacity-40"
          >
            {busy === "rephrase" ? "Rephrasing…" : "Rephrase"}
          </button>
          <button
            onClick={() => {
              if (!editor || isEmpty) return;
              const lang = window.prompt("Translate the draft into which language?", "French");
              if (lang) runCopilot("translate", () => copilot.translate(editor.getText(), lang), (t) => editor.commands.setContent(textToHtml(t)));
            }}
            disabled={!!busy || isPending || isEmpty}
            className="rounded border border-line px-2 py-1 text-ink-2 hover:bg-surface-2 disabled:opacity-40"
          >
            Translate
          </button>
        </div>
      )}

      {summary && (
        <div className="mx-2.5 mt-2 rounded-md border border-line bg-surface-2 p-2 text-xs text-ink-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-ink-2">Thread summary</span>
            <button onClick={() => setSummary(null)} className="text-ink-3 hover:text-ink" aria-label="Dismiss summary">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {summary}
        </div>
      )}

      {/* Formatting toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line-soft px-2 py-1.5">
        <ToolbarButton label="Bold" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton label="Bulleted list" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton label="Quote" active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton label="Add link" active={editor?.isActive("link")} onClick={() => editor && setLink(editor)}>
          <Link2 className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-line" />
        <ToolbarButton label="Attach image" onClick={() => imageInput.current?.click()}>
          <ImageIcon className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton label="Attach file" onClick={() => fileInput.current?.click()}>
          <Paperclip className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
      </div>

      <input ref={imageInput} type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={fileInput} type="file" accept={FILE_ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

      <EditorContent editor={editor} />

      {/* Attachment chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink">
              <Paperclip className="h-3 w-3 text-ink-3" strokeWidth={1.75} />
              <span className="max-w-[160px] truncate">{f.name}</span>
              <span className="text-ink-3">{formatBytes(f.size)}</span>
              <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-ink-3 hover:text-red-600 dark:hover:text-red-400">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <div className="mx-2.5 mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-line-soft px-2.5 py-2">
        <button
          onClick={() => submit(sendReply)}
          disabled={isPending || (isEmpty && files.length === 0)}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-40 dark:bg-brand-500 dark:hover:bg-brand-400"
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />}
          {isPending ? "Working…" : "Reply to customer"}
        </button>
        <button
          onClick={() => submit(addNote)}
          disabled={isPending || (isEmpty && files.length === 0)}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-40"
        >
          Internal note
        </button>
        {canned.length > 0 && (
          <select
            className="ml-auto rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink-2"
            value=""
            onChange={(e) => {
              const found = canned.find((c) => c.id === e.target.value);
              if (found && editor) editor.chain().focus().insertContent(textToHtml(found.body)).run();
              e.target.value = "";
            }}
            aria-label="Insert canned response"
          >
            <option value="" disabled>
              Canned responses…
            </option>
            {canned.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
