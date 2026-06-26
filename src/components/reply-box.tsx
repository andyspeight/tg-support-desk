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
import { applyCannedVars, type CannedVars } from "@/lib/canned";

type CannedOption = { id: string; title: string; body: string };
type ComposerResult = { ok: true; note?: string } | { ok: false; error: string };
type CopilotResult = { ok: true; text: string } | { ok: false; error: string };
type ReviewResult =
  | { ok: true; verdict: "ok" | "revise"; issues: string[]; rewrite: string }
  | { ok: false; error: string };

type Props = {
  ticketId: string;
  canned: CannedOption[];
  sendReply: (formData: FormData) => Promise<ComposerResult>;
  addNote: (formData: FormData) => Promise<ComposerResult>;
  vars?: CannedVars;
  copilot?: {
    draft: (ticketId: string) => Promise<CopilotResult>;
    summarise: (ticketId: string) => Promise<CopilotResult>;
    rephrase: (text: string) => Promise<CopilotResult>;
    translate: (text: string, language: string) => Promise<CopilotResult>;
    review: (ticketId: string, text: string) => Promise<ReviewResult>;
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

export function ReplyBox({ ticketId, canned, sendReply, addNote, vars, copilot }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [review, setReview] = useState<{ issues: string[]; rewrite: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [afterStatus, setAfterStatus] = useState("waiting_on_customer"); // status to set when replying
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

  async function buildAndSend(action: (formData: FormData) => Promise<ComposerResult>) {
    if (!editor) return;
    const fd = new FormData();
    fd.set("ticketId", ticketId);
    fd.set("html", editor.getHTML());
    fd.set("afterStatus", afterStatus);
    for (const f of files) fd.append("files", f);
    setError(null);
    setInfo(null);
    try {
      const res = await action(fd);
      if (!res.ok) {
        // Keep the draft + attachments so the agent can fix and retry.
        setError(res.error);
        return;
      }
      editor.commands.clearContent();
      setFiles([]);
      setSummary(null);
      setReview(null);
      if (res.note) setInfo(res.note);
    } catch {
      setError("Something went wrong and your reply wasn’t sent. Your message is still here — please try again.");
    }
  }

  function submit(action: (formData: FormData) => Promise<ComposerResult>) {
    if (!editor || isPending) return;
    if (isEmpty && files.length === 0) return;
    startTransition(() => buildAndSend(action));
  }

  // Pre-send quality gate: check tone/content first, then send — or surface a
  // suggested rewrite the agent can accept, override, or keep editing. Notes
  // skip this (they're internal). Fail-open: any AI hiccup just sends.
  function reviewThenSend() {
    if (!editor || isPending || (isEmpty && files.length === 0)) return;
    const text = editor.getText().trim();
    if (!copilot?.review || text === "") {
      submit(sendReply);
      return;
    }
    const reviewFn = copilot.review;
    setBusy("review");
    setError(null);
    setReview(null);
    startTransition(async () => {
      const res = await reviewFn(ticketId, text);
      if (!res.ok || res.verdict === "ok") {
        await buildAndSend(sendReply);
      } else {
        setReview({ issues: res.issues, rewrite: res.rewrite });
      }
      setBusy(null);
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
    <div
      className="relative rounded-xl border border-line bg-surface shadow-sm"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent-400 bg-accent-50/85 text-sm font-medium text-accent-700 dark:bg-accent-500/15 dark:text-accent-200">
          Drop files to attach
        </div>
      )}
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

      {info && (
        <div className="mx-2.5 mb-2 flex items-start justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} aria-label="Dismiss" className="shrink-0 text-amber-700/70 hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Pre-send quality check */}
      {review && (
        <div className="mx-2.5 mb-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs dark:border-amber-500/25 dark:bg-amber-500/10">
          <div className="mb-1.5 flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} /> Before you send — this could read warmer
          </div>
          {review.issues.length > 0 && (
            <ul className="mb-2 list-disc space-y-0.5 pl-4 text-amber-800 dark:text-amber-200">
              {review.issues.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          )}
          {review.rewrite && (
            <div className="mb-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-amber-200 bg-surface p-2 text-ink dark:border-amber-500/25">
              {review.rewrite}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {review.rewrite && (
              <button
                onClick={() => {
                  if (!editor) return;
                  editor.commands.setContent(textToHtml(review.rewrite));
                  setReview(null);
                  startTransition(() => buildAndSend(sendReply));
                }}
                disabled={isPending}
                className="rounded-md bg-brand-600 px-2.5 py-1 font-medium text-white hover:bg-brand-700 disabled:opacity-40 dark:bg-brand-500 dark:hover:bg-brand-400"
              >
                Use rewrite &amp; send
              </button>
            )}
            <button
              onClick={() => {
                setReview(null);
                submit(sendReply);
              }}
              disabled={isPending}
              className="rounded-md border border-line bg-surface px-2.5 py-1 font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-40"
            >
              Send as-is
            </button>
            <button onClick={() => setReview(null)} disabled={isPending} className="rounded-md px-2.5 py-1 text-ink-3 hover:text-ink disabled:opacity-40">
              Keep editing
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-2.5 py-2">
        <button
          onClick={reviewThenSend}
          disabled={isPending || (isEmpty && files.length === 0)}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-40 dark:bg-brand-500 dark:hover:bg-brand-400"
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />}
          {busy === "review"
            ? "Checking…"
            : isPending
              ? "Working…"
              : afterStatus === "resolved"
                ? "Reply & resolve"
                : afterStatus === "closed"
                  ? "Reply & close"
                  : "Reply to customer"}
        </button>
        <select
          value={afterStatus}
          onChange={(e) => setAfterStatus(e.target.value)}
          aria-label="Status after sending"
          title="What to do with the ticket after you reply"
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink-2 focus:border-ink-3 focus:outline-none"
        >
          <option value="waiting_on_customer">then → Waiting on customer</option>
          <option value="pending">then → Pending</option>
          <option value="resolved">then → Resolve</option>
          <option value="closed">then → Close</option>
        </select>
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
              if (found && editor) editor.chain().focus().insertContent(textToHtml(applyCannedVars(found.body, vars ?? {}))).run();
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
