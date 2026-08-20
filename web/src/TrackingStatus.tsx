import { useCallback, useMemo, useState } from "react";
import { api } from "./api";
import { formatDuration } from "./format";
import { useTracking } from "./tracking";
import { useFocusMode } from "./useFocusMode";
import { useIdleAutoStop } from "./useIdleAutoStop";

// The header home of the two session flags — focus mode (nag me while I'm not
// tracking) and auto-stop (drop the timer when I walk away) — as a matched pair
// of always-visible chips. They're flipped many times a day, so they sit in the
// open rather than behind a disclosure.
//
// This component also *mounts* both hooks, which is why it exists on every tab:
// the reminder clock, the tab title, and the idle watcher all run from here,
// not from whichever view happens to be on screen. There is deliberately no
// status badge — the running task, its live clock and its stop button belong to
// the task rows in TodayView, and a second copy in the header only competed
// with them. What can't live in a row stays here: `document.title` shows the
// running task on every tab, and a flag's `notice` (permission denied, or an
// auto-stop that already happened) rides its chip as an amber ring + tooltip.

function FlagChip({
  label,
  title,
  checked,
  onChange,
  notice,
}: {
  label: string;
  title: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  notice?: string | null;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={notice ? `${title}\n\n${notice}` : title}
      onClick={() => onChange(!checked)}
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
        checked
          ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-900/25 dark:text-indigo-300"
          : "border-slate-200 bg-white text-slate-500 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
      } ${notice ? "ring-2 ring-amber-400/50" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-block h-4 w-7 shrink-0 rounded-full transition-colors ${
          checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-3" : "translate-x-0"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

export default function TrackingStatus() {
  const { tasks, active, invalidate } = useTracking();
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      <FlagChip
        label="Focus"
        title="Focus mode — reminds you every 5 min while no timer is running. Switching it off stops the running timer."
        checked={focus.on}
        onChange={focus.toggle}
        notice={focus.notice ?? error}
      />
      <FlagChip
        label="Auto-idle"
        title="Auto-stop when idle — stops the timer after 15 min with no keyboard, mouse, or unlocked screen."
        checked={idle.autoStop}
        onChange={idle.toggleAutoStop}
        notice={idle.idleMsg}
      />

      {/* the reminder has no visual home now, so keep announcing it */}
      <span role="status" aria-live="polite" className="sr-only">
        {focus.nudging ? `Not tracking for ${formatDuration(focus.untrackedMs / 1000)}` : ""}
      </span>
    </>
  );
}
