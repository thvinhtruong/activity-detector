import { useEffect, useRef, useState } from "react";
import { api, type Task } from "./api";

// Per-task notes, stored in the existing `tasks.description` column.
//
// A note is plain text, but any line shaped like "- [ ] thing" / "- [x] thing"
// renders as a real checkbox you can tick without entering edit mode — so the
// same field works as a scratchpad *and* as a small checklist for the task.

const CHECK_RE = /^(\s*)([-*])\s\[([ xX])\]\s?(.*)$/;

type Line =
  | { kind: "check"; done: boolean; text: string; raw: string }
  | { kind: "text"; text: string };

export function parseNote(note: string): Line[] {
  if (!note) return [];
  return note.split("\n").map((raw) => {
    const m = raw.match(CHECK_RE);
    if (!m) return { kind: "text", text: raw } as Line;
    return { kind: "check", done: m[3] !== " ", text: m[4], raw } as Line;
  });
}

export function noteStats(note: string) {
  const lines = parseNote(note);
  const checks = lines.filter((l) => l.kind === "check") as Extract<Line, { kind: "check" }>[];
  const firstText = lines.find((l) => l.text.trim())?.text.trim() ?? "";
  return {
    total: checks.length,
    done: checks.filter((c) => c.done).length,
    empty: !note.trim(),
    preview: firstText.replace(CHECK_RE, "$4") || firstText,
  };
}

// Flip the checkbox on line `index` and return the new note text.
function toggleLine(note: string, index: number): string {
  const lines = note.split("\n");
  const m = lines[index]?.match(CHECK_RE);
  if (!m) return note;
  lines[index] = `${m[1]}${m[2]} [${m[3] === " " ? "x" : " "}] ${m[4]}`;
  return lines.join("\n");
}

/** Compact button that opens the note panel; doubles as the "has a note" indicator. */
export function NoteToggle({
  task,
  open,
  onClick,
  className = "",
}: {
  task: Task;
  open: boolean;
  onClick: () => void;
  className?: string;
}) {
  const { total, done, empty } = noteStats(task.description);
  const allDone = total > 0 && done === total;

  return (
    <button
      onClick={onClick}
      title={empty ? "Add a note" : "Notes"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition ${
        open
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
          : empty
            ? "text-slate-300 hover:bg-slate-100 hover:text-indigo-500 dark:text-slate-600 dark:hover:bg-slate-800"
            : "text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-slate-800"
      }`}
    >
      <span aria-hidden>🗒</span>
      {total > 0 && (
        <span
          className={`font-mono tabular-nums ${
            allDone ? "text-emerald-600 dark:text-emerald-400" : ""
          }`}
        >
          {done}/{total}
        </span>
      )}
    </button>
  );
}

/** One-line preview of the note, for collapsed rows. */
export function NotePreview({ task, className = "" }: { task: Task; className?: string }) {
  const { preview } = noteStats(task.description);
  if (!preview) return null;
  return <span className={`truncate normal-case ${className}`}>{preview}</span>;
}

/**
 * The note editor. Reads as a checklist / text block; click it to edit.
 * Saves on blur or ⌘/Ctrl+Enter, discards on Escape.
 */
export function NotePanel({
  task,
  onSaved,
  onError,
  autoEdit = false,
}: {
  task: Task;
  onSaved: () => void;
  onError: (msg: string) => void;
  autoEdit?: boolean;
}) {
  const [editing, setEditing] = useState(autoEdit || !task.description.trim());
  const [value, setValue] = useState(task.description);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // pick up external changes (e.g. a refresh) while not mid-edit
  useEffect(() => {
    if (!editing) setValue(task.description);
  }, [task.description, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  async function persist(next: string) {
    if (next === task.description) return;
    try {
      await api.update(task.id, { description: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    } catch (e: any) {
      onError(e.message);
    }
  }

  const lines = parseNote(value);

  // Enter on a checklist line continues the list; ⌘/Ctrl+Enter saves and closes.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      setValue(task.description);
      setEditing(false);
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setEditing(false);
      persist(value);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      const el = e.currentTarget;
      const start = el.selectionStart;
      const lineStart = el.value.lastIndexOf("\n", start - 1) + 1;
      const m = el.value.slice(lineStart, start).match(CHECK_RE);
      if (!m) return; // plain text line: let Enter do its normal thing
      e.preventDefault();
      let next: string;
      let pos: number;
      if (m[4].trim()) {
        const insert = `\n${m[1]}${m[2]} [ ] `;
        next = el.value.slice(0, start) + insert + el.value.slice(el.selectionEnd);
        pos = start + insert.length;
      } else {
        // an empty checklist item ends the list instead of continuing it
        next = el.value.slice(0, lineStart) + "\n" + el.value.slice(el.selectionEnd);
        pos = lineStart + 1;
      }
      setValue(next);
      requestAnimationFrame(() => ref.current?.setSelectionRange(pos, pos));
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Notes
        </h3>
        {saved && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Saved ✓</span>
        )}
        <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-400">
          {editing ? (
            <>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const next = (value.trimEnd() ? value.trimEnd() + "\n" : "") + "- [ ] ";
                  setValue(next);
                  ref.current?.focus();
                }}
                className="rounded px-1.5 py-0.5 font-medium text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
              >
                + Checklist item
              </button>
              <span className="hidden sm:inline">⌘⏎ save · esc cancel</span>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded px-1.5 py-0.5 font-medium text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          ref={ref}
          value={value}
          rows={Math.min(12, Math.max(3, value.split("\n").length + 1))}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setEditing(false);
            persist(value);
          }}
          placeholder={"Quick notes…\n- [ ] a step to tick off"}
          className="w-full resize-y rounded-lg border border-indigo-400 bg-white px-2.5 py-2 text-xs leading-relaxed outline-none dark:bg-slate-900"
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="cursor-text rounded-lg border border-transparent px-2.5 py-2 text-xs leading-relaxed hover:border-slate-200 dark:hover:border-slate-700"
        >
          {lines.length === 0 ? (
            <span className="text-slate-400">Add a note…</span>
          ) : (
            lines.map((l, i) =>
              l.kind === "check" ? (
                <label
                  key={i}
                  onClick={(e) => e.stopPropagation()}
                  className="flex cursor-pointer items-start gap-2 py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={l.done}
                    onChange={() => {
                      const next = toggleLine(value, i);
                      setValue(next);
                      persist(next);
                    }}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-600"
                  />
                  <span
                    className={l.done ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200"}
                  >
                    {l.text || <span className="text-slate-300">empty</span>}
                  </span>
                </label>
              ) : (
                <p key={i} className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                  {l.text || " "}
                </p>
              ),
            )
          )}
        </div>
      )}
    </div>
  );
}
