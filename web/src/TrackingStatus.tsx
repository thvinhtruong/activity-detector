import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, parseUTC, type Task } from "./api";
import { formatClock, formatDuration } from "./format";
import { useTracking } from "./tracking";
import { useFocusMode } from "./useFocusMode";
import { useIdleAutoStop } from "./useIdleAutoStop";

// The one always-visible home for tracking state: an ambient pill in the header
// that opens a popover holding the two session flags as a matched pair —
// focus mode (nag me while I'm not tracking) and auto-stop (drop the timer when
// I walk away). They're the two halves of "keep my tracking honest", so they get
// identical rows rather than one being a checkbox tacked onto a view.

const dotBase = "inline-block h-2 w-2 shrink-0 rounded-full";

// Which task a "resume" button should start: whatever was left mid-flight, else
// the most recently touched unfinished one.
function resumeCandidate(tasks: Task[]): Task | null {
  const open = tasks.filter((t) => t.status !== "done");
  const doing = open.filter((t) => t.status === "doing");
  const pool = doing.length ? doing : open;
  return (
    pool
      .slice()
      .sort((a, b) => parseUTC(b.updated_at).getTime() - parseUTC(a.updated_at).getTime())[0] ??
    null
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
        checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        className={`pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function FlagRow({
  title,
  desc,
  checked,
  onChange,
  children,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {desc}
        </p>
        {children}
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export default function TrackingStatus() {
  const { tasks, active, invalidate } = useTracking();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const runningTask = useMemo(
    () => (active ? (tasks.find((t) => t.id === active.task_id) ?? null) : null),
    [tasks, active],
  );

  const stopTimer = useCallback(async () => {
    try {
      await api.stop();
      invalidate();
    } catch (e: any) {
      setError(e.message);
    }
  }, [invalidate]);

  const focus = useFocusMode({
    active,
    runningLabel: runningTask?.title,
    onStopTimer: stopTimer,
  });
  const idle = useIdleAutoStop({ active, onStopped: invalidate, onError: setError });

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const elapsed = active ? (now - parseUTC(active.started_at).getTime()) / 1000 : 0;
  const candidate = useMemo(() => resumeCandidate(tasks), [tasks]);

  const act = (fn: () => Promise<unknown>) => async () => {
    try {
      setError(null);
      await fn();
      invalidate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // pill appearance: tracking > overdue reminder > quiet
  const pill = active
    ? {
        cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300",
        dot: "bg-amber-500",
        label: runningTask?.title ?? "Tracking",
        value: formatClock(elapsed),
      }
    : focus.nudging
      ? {
          cls: "border-red-300 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-300",
          dot: "bg-red-500",
          label: "Not tracking",
          value: formatDuration(focus.untrackedMs / 1000),
        }
      : {
          cls: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400",
          dot: "bg-slate-400",
          label: focus.on ? "Focus on" : "Not tracking",
          value: "",
        };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Tracking status and session settings"
        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${pill.cls}`}
      >
        <span className={`${dotBase} ${pill.dot} ${active ? "motion-safe:animate-pulse" : ""}`} />
        <span className="max-w-[10rem] truncate">{pill.label}</span>
        {pill.value && <span className="font-mono tabular-nums">{pill.value}</span>}
        <span aria-hidden="true" className="opacity-60">
          ▾
        </span>
      </button>

      {/* live region so the reminder is announced without stealing focus */}
      <span role="status" aria-live="polite" className="sr-only">
        {active
          ? `Tracking ${runningTask?.title ?? "a task"}`
          : focus.nudging
            ? `Not tracking for ${formatDuration(focus.untrackedMs / 1000)}`
            : ""}
      </span>

      {open && (
        <div
          role="dialog"
          aria-label="Tracking session"
          className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {/* ---- what's happening right now ---- */}
          <div className="flex items-center gap-2 pb-3">
            <span className={`${dotBase} ${pill.dot}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {active ? (runningTask?.title ?? "Running") : "Nothing running"}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {active
                  ? formatClock(elapsed)
                  : focus.on
                    ? `Off the clock ${formatDuration(focus.untrackedMs / 1000)} · next reminder in ${formatDuration(focus.nextNudgeMs / 1000)}`
                    : "Focus mode is off"}
              </div>
            </div>
            {active ? (
              <button
                onClick={act(() => api.stop())}
                className="shrink-0 cursor-pointer rounded-md bg-red-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-400 focus-visible:ring-2 focus-visible:ring-red-500/40"
              >
                ⏹ Stop
              </button>
            ) : (
              candidate && (
                <button
                  onClick={act(() => api.start(candidate.id))}
                  title={`Start "${candidate.title}"`}
                  className="shrink-0 cursor-pointer rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                >
                  ▶ Resume
                </button>
              )
            )}
          </div>

          {error && (
            <div className="mb-2 rounded-md bg-red-100 px-2 py-1 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {error}
            </div>
          )}

          {/* ---- the two session flags, as a matched pair ---- */}
          <div className="divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            <FlagRow
              title="Focus mode"
              desc="Reminds you every 5 min while no timer is running. Switching it off stops the running timer."
              checked={focus.on}
              onChange={focus.toggle}
            >
              {focus.notice && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  {focus.notice}
                </p>
              )}
            </FlagRow>

            <FlagRow
              title="Auto-stop when idle"
              desc="Stops the timer after 15 min with no keyboard, mouse, or unlocked screen."
              checked={idle.autoStop}
              onChange={idle.toggleAutoStop}
            >
              {idle.idleMsg && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  {idle.idleMsg}
                </p>
              )}
            </FlagRow>
          </div>
        </div>
      )}
    </div>
  );
}
