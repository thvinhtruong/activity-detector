import { Fragment, useEffect, useRef, useState } from "react";
import {
  api,
  fromLocalInput,
  parseUTC,
  toLocalInput,
  type Active,
  type Recurrence,
  type Status,
  type Task,
  type TimeEntry,
} from "./api";
import { formatClock, formatDuration, formatMinutes, parseMinutes } from "./format";

const STATUSES: Status[] = ["todo", "doing", "done", "recurring"];
const RECURRENCES: Recurrence[] = ["daily", "weekly"];

// Auto-stop the running timer after this much system-wide inactivity (keyboard,
// mouse, or screen lock), detected via the browser Idle Detection API.
const IDLE_THRESHOLD_MS = 15 * 60 * 1000;
const AUTOSTOP_KEY = "ad-autostop";

const statusStyles: Record<Status, string> = {
  todo: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  doing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  recurring: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
};

export default function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [active, setActive] = useState<Active | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [autoStop, setAutoStop] = useState(
    () => localStorage.getItem(AUTOSTOP_KEY) === "1",
  );
  const [idleMsg, setIdleMsg] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const activeRef = useRef<Active | null>(null);

  // 1s tick drives the live timer display
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    try {
      const { tasks, active } = await api.tasks();
      setTasks(tasks);
      setActive(active);
      activeRef.current = active;
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  // Idle auto-stop: when enabled, watch system-wide idle / screen lock. On idle,
  // stop the running timer and backdate the stop to when inactivity began.
  useEffect(() => {
    if (!autoStop) return;
    if (!("IdleDetector" in window)) {
      setIdleMsg("Idle detection isn't supported here — use Chrome or Edge.");
      setAutoStop(false);
      return;
    }
    const controller = new AbortController();
    let detector: any;
    (async () => {
      try {
        const Idle = (window as any).IdleDetector;
        if ((await Idle.requestPermission()) !== "granted") {
          setIdleMsg("Idle-detection permission was denied.");
          setAutoStop(false);
          return;
        }
        detector = new Idle();
        detector.addEventListener("change", async () => {
          const idle = detector.userState === "idle" || detector.screenState === "locked";
          if (!idle || !activeRef.current) return;
          // backdate to when inactivity began, but not before the entry started
          const startedMs = parseUTC(activeRef.current.started_at).getTime();
          const stopMs = Math.max(startedMs, Date.now() - IDLE_THRESHOLD_MS);
          try {
            await api.stop(new Date(stopMs).toISOString());
            setIdleMsg(`Auto-stopped — idle since ${new Date(stopMs).toLocaleTimeString()}.`);
            await refresh();
          } catch (e: any) {
            setError(e.message);
          }
        });
        await detector.start({ threshold: IDLE_THRESHOLD_MS, signal: controller.signal });
        setIdleMsg(null);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setIdleMsg(e?.message ?? "Could not start idle detection.");
          setAutoStop(false);
        }
      }
    })();
    return () => controller.abort();
  }, [autoStop]);

  function toggleAutoStop(on: boolean) {
    setIdleMsg(null);
    localStorage.setItem(AUTOSTOP_KEY, on ? "1" : "0");
    setAutoStop(on);
  }

  const liveSeconds = (taskId: number, base: number) => {
    if (active?.task_id !== taskId) return base;
    return base + (now - parseUTC(active.started_at).getTime()) / 1000;
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    await api.create(title);
    refresh();
  }

  const act = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const visibleTasks = showDone ? tasks : tasks.filter((t) => t.status !== "done");

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task and press Enter…"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
        />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          Add
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={autoStop}
            onChange={(e) => toggleAutoStop(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Auto-stop timer after 15 min idle
        </label>
        {idleMsg && <span className="text-xs text-amber-600 dark:text-amber-400">{idleMsg}</span>}
        {doneCount > 0 && (
          <button
            onClick={() => setShowDone((v) => !v)}
            className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            {showDone ? `Hide completed (${doneCount})` : `Show completed (${doneCount})`}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-2.5 font-medium">Task</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Duration</th>
              <th className="px-4 py-2.5 text-right font-medium">Time</th>
              <th className="px-4 py-2.5 text-right font-medium">Track</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleTasks.map((t) => {
              const running = active?.task_id === t.id;
              const secs = liveSeconds(t.id, t.total_seconds);
              return (
                <Fragment key={t.id}>
                <tr
                  className={running ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}
                >
                  <td className="px-4 py-2.5">
                    <EditableTitle task={t} onSaved={refresh} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={t.status}
                        onChange={(e) => {
                          const status = e.target.value as Status;
                          const patch =
                            status === "recurring" && t.recurrence === "none"
                              ? { status, recurrence: "daily" as Recurrence }
                              : { status };
                          act(() => api.update(t.id, patch))();
                        }}
                        className={`cursor-pointer rounded-md border-0 px-2 py-1 text-xs font-medium capitalize ${statusStyles[t.status]}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      {t.status === "recurring" && (
                        <select
                          value={t.recurrence === "none" ? "daily" : t.recurrence}
                          onChange={(e) =>
                            act(() => api.update(t.id, { recurrence: e.target.value as Recurrence }))()
                          }
                          className="cursor-pointer rounded-md border-0 bg-slate-100 px-1.5 py-1 text-xs text-slate-600 capitalize dark:bg-slate-800 dark:text-slate-300"
                        >
                          {RECURRENCES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <EditableDuration task={t} onSaved={refresh} onError={setError} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    <button
                      onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                      title="View / edit time entries"
                      className="rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {running ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {formatClock(secs)}
                        </span>
                      ) : (
                        <span className="text-slate-500">{formatDuration(secs)}</span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {running ? (
                      <button
                        onClick={act(() => api.stop())}
                        className="rounded-md bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-400"
                      >
                        ⏹ Stop
                      </button>
                    ) : (
                      <button
                        onClick={act(() => api.start(t.id))}
                        className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                      >
                        ▶ Start
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={act(() => api.remove(t.id))}
                      title="Delete task"
                      className="text-slate-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
                {expanded === t.id && (
                  <tr>
                    <td colSpan={6} className="bg-slate-50/70 px-4 py-3 dark:bg-slate-800/30">
                      <EntriesEditor
                        taskId={t.id}
                        onChanged={refresh}
                        onError={setError}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {visibleTasks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  {tasks.length === 0
                    ? "No tasks yet — add one above."
                    : "All tasks completed — use “Show completed” to see them."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditableTitle({ task, onSaved }: { task: Task; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.title);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  async function save() {
    setEditing(false);
    const v = value.trim();
    if (v && v !== task.title) {
      await api.update(task.id, { title: v });
      onSaved();
    } else {
      setValue(task.title);
    }
  }

  return editing ? (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") {
          setValue(task.title);
          setEditing(false);
        }
      }}
      className="w-full rounded-md border border-indigo-400 bg-white px-2 py-1 outline-none dark:bg-slate-800"
    />
  ) : (
    <button
      onClick={() => setEditing(true)}
      className={`text-left ${task.status === "done" ? "text-slate-400 line-through" : ""}`}
    >
      {task.title}
    </button>
  );
}

// Planned duration, editable inline. Accepts "1h30m", "90", "2h", "45m".
function EditableDuration({
  task,
  onSaved,
  onError,
}: {
  task: Task;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formatMinutes(task.duration_minutes));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  async function save() {
    const mins = parseMinutes(value);
    if (mins === null) {
      onError("Invalid duration — try e.g. 1h30m, 90, or 45m");
      setValue(formatMinutes(task.duration_minutes));
      setEditing(false);
      return;
    }
    setEditing(false);
    if (mins !== task.duration_minutes) {
      try {
        await api.update(task.id, { duration_minutes: mins });
        onSaved();
      } catch (e: any) {
        onError(e.message);
      }
    }
  }

  return editing ? (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") {
          setValue(formatMinutes(task.duration_minutes));
          setEditing(false);
        }
      }}
      className="w-16 rounded-md border border-indigo-400 bg-white px-2 py-1 text-right text-xs outline-none dark:bg-slate-800"
    />
  ) : (
    <button
      onClick={() => {
        setValue(formatMinutes(task.duration_minutes));
        setEditing(true);
      }}
      title="Edit planned duration"
      className="font-mono tabular-nums text-slate-500 hover:text-indigo-500"
    >
      {formatMinutes(task.duration_minutes)}
    </button>
  );
}

const inputCls =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900";

function EntriesEditor({
  taskId,
  onChanged,
  onError,
}: {
  taskId: number;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const { entries } = await api.entries(taskId);
      setEntries(entries);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [taskId]);

  // after a mutation: reload local entries AND refresh the parent task totals
  const after = async () => {
    await load();
    onChanged();
  };

  const wrap = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
      await after();
    } catch (e: any) {
      onError(e.message);
    }
  };

  if (loading) return <p className="text-xs text-slate-400">Loading entries…</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Time entries
        </h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
          >
            + Add entry
          </button>
        )}
      </div>

      {adding && (
        <AddEntryForm
          onCancel={() => setAdding(false)}
          onSubmit={async (from, to) => {
            await api.addEntry(taskId, from, to);
            setAdding(false);
            await after();
          }}
          onError={onError}
        />
      )}

      {entries.length === 0 && !adding ? (
        <p className="text-xs text-slate-400">No entries yet.</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              onSave={(patch) => wrap(() => api.updateEntry(e.id, patch))()}
              onDelete={wrap(() => api.removeEntry(e.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddEntryForm({
  onSubmit,
  onCancel,
  onError,
}: {
  onSubmit: (from: string, to: string) => Promise<void>;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  // default: a 1-hour block ending now, in local time
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 3600_000);
  const [from, setFrom] = useState(toLocalInput(hourAgo.toISOString()));
  const [to, setTo] = useState(toLocalInput(now.toISOString()));

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
      <label className="flex flex-col gap-0.5 text-[10px] uppercase text-slate-400">
        Start
        <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] uppercase text-slate-400">
        End
        <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
      </label>
      <button
        onClick={async () => {
          if (fromLocalInput(to) < fromLocalInput(from)) return onError("End must be after start");
          await onSubmit(fromLocalInput(from), fromLocalInput(to));
        }}
        className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="rounded-md px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      >
        Cancel
      </button>
    </div>
  );
}

function EntryRow({
  entry,
  onSave,
  onDelete,
}: {
  entry: TimeEntry;
  onSave: (patch: { started_at: string; ended_at: string }) => void;
  onDelete: () => void;
}) {
  const running = entry.ended_at === null;
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState(toLocalInput(entry.started_at));
  const [to, setTo] = useState(entry.ended_at ? toLocalInput(entry.ended_at) : "");

  if (editing) {
    return (
      <li className="flex flex-wrap items-end gap-2 rounded-lg border border-indigo-300 bg-white p-2 dark:border-indigo-700 dark:bg-slate-900">
        <label className="flex flex-col gap-0.5 text-[10px] uppercase text-slate-400">
          Start
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] uppercase text-slate-400">
          End
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </label>
        <button
          onClick={() => {
            setEditing(false);
            onSave({ started_at: fromLocalInput(from), ended_at: fromLocalInput(to) });
          }}
          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
        >
          Save
        </button>
        <button
          onClick={() => {
            setFrom(toLocalInput(entry.started_at));
            setTo(entry.ended_at ? toLocalInput(entry.ended_at) : "");
            setEditing(false);
          }}
          className="rounded-md px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
      <span className="font-mono text-slate-600 dark:text-slate-300">
        {fmtLocal(entry.started_at)} → {running ? <em className="text-amber-600">running…</em> : fmtLocal(entry.ended_at!)}
      </span>
      <span className="flex items-center gap-3">
        <span className="font-mono text-slate-400">
          {entry.seconds != null ? formatDuration(entry.seconds) : "—"}
        </span>
        {!running && (
          <button onClick={() => setEditing(true)} className="text-indigo-500 hover:text-indigo-400">
            Edit
          </button>
        )}
        <button onClick={onDelete} title="Delete entry" className="text-slate-400 hover:text-red-500">
          ✕
        </button>
      </span>
    </li>
  );
}

// "2026-05-26 14:30:00" UTC -> short local "May 26, 14:30"
function fmtLocal(s: string): string {
  return parseUTC(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
