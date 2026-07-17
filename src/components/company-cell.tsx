"use client";

import { useMemo, useRef, useState, useTransition } from "react";

type Company = { id: string; name: string };

/**
 * Inline, editable company on an inbox row. Reads as plain text; click to edit
 * via a searchable combobox (a shared <datalist> keeps the option list out of
 * every row). Picking a company links the requester to it — the same operation
 * as the ticket page, reachable without opening the ticket.
 */
export function CompanyCell({
  ticketId,
  currentName,
  companies,
  listId,
  setCompany,
}: {
  ticketId: string;
  currentName: string | null;
  companies: Company[];
  listId: string;
  setCompany: (formData: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const done = useRef(false);

  const nameToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.name.toLowerCase(), c.id);
    return m;
  }, [companies]);

  function open() {
    done.current = false;
    setEditing(true);
  }

  function commit(value: string) {
    if (done.current) return;
    const v = value.trim();
    // Unchanged, empty, or no exact match → cancel without a write.
    if (!v || v.toLowerCase() === (currentName ?? "").toLowerCase()) {
      setEditing(false);
      return;
    }
    const id = nameToId.get(v.toLowerCase());
    if (!id) {
      setEditing(false);
      return;
    }
    done.current = true;
    const fd = new FormData();
    fd.set("ticketId", ticketId);
    fd.set("clientId", id);
    startTransition(async () => {
      await setCompany(fd);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
        title={currentName ? `${currentName} — click to change` : "Set the company for this customer"}
        className={`block w-full max-w-[10rem] truncate rounded px-1 py-0.5 text-left text-xs hover:bg-surface-2 ${
          currentName ? "text-ink-2" : "italic text-ink-3"
        }`}
      >
        {currentName ?? "Set company"}
      </button>
    );
  }

  return (
    <input
      list={listId}
      defaultValue={currentName ?? ""}
      autoFocus
      disabled={isPending}
      onClick={(e) => e.stopPropagation()}
      // Commit only on an explicit finish (Enter / click away). We deliberately
      // do NOT commit on every change: auto-closing the box mid-type could drop
      // focus back to the list and let the next keystrokes hit the resolve/
      // escalate shortcuts. Keystrokes stay contained while the box is open.
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit((e.target as HTMLInputElement).value);
        } else if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      onBlur={(e) => commit(e.target.value)}
      placeholder="Type a company…"
      aria-label="Set company"
      className="w-full max-w-[10rem] rounded border border-line bg-surface px-1 py-0.5 text-xs text-ink focus:border-ink-3 focus:outline-none disabled:opacity-50"
    />
  );
}
