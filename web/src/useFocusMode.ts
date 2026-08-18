import { useCallback, useEffect, useRef, useState } from "react";
import type { Active } from "./api";

// Focus mode — a manual "I'm working right now" switch, and the companion to
// useIdleAutoStop:
//
//   auto-stop  →  you went idle 15 min, so the timer stops on its own
//   focus mode →  a timer isn't running, so you get reminded every 5 min
//
// Presence is declared, not detected: while focus mode is on you are saying you
// intend to be tracking, so any untracked stretch is worth a nudge. Finishing
// work means switching focus mode off, which also stops whatever is running —
// so the "stop nagging me" action and the "I'm done" action are the same one.

const KEY = "ad-focus";
const BASE_TITLE = "Activity Detector";
const NUDGE_EVERY_MS = 5 * 60_000;
const TICK_MS = 15_000;

type Options = {
  active: Active | null;
  runningLabel?: string; // shown in the tab title while tracking
  onStopTimer: () => Promise<unknown> | unknown; // switching off ends the session
};

export function useFocusMode({ active, runningLabel, onStopTimer }: Options) {
  const [on, setOn] = useState(() => localStorage.getItem(KEY) === "1");
  const [notice, setNotice] = useState<string | null>(null);
  const [untrackedMs, setUntrackedMs] = useState(0);

  // start of the current untracked stretch; null while a timer runs
  const sinceRef = useRef<number | null>(null);
  const nudgesRef = useRef(0);
  const onRef = useRef(on);
  onRef.current = on;
  const activeRef = useRef(active);
  activeRef.current = active;
  const labelRef = useRef(runningLabel);
  labelRef.current = runningLabel;

  const tickRef = useRef<() => void>(() => {});

  useEffect(() => {
    const setTitle = (t: string) => {
      if (document.title !== t) document.title = t;
    };

    function tick() {
      if (!onRef.current) {
        sinceRef.current = null;
        nudgesRef.current = 0;
        setUntrackedMs(0);
        setTitle(BASE_TITLE);
        return;
      }

      if (activeRef.current) {
        sinceRef.current = null;
        nudgesRef.current = 0;
        setUntrackedMs(0);
        setTitle(labelRef.current ? `● ${labelRef.current} · ${BASE_TITLE}` : `● ${BASE_TITLE}`);
        return;
      }

      const now = Date.now();
      if (sinceRef.current === null) sinceRef.current = now;
      // elapsed is always a clock delta, never a count of ticks — a hidden tab
      // throttles this interval to roughly once a minute
      const elapsed = now - sinceRef.current;
      setUntrackedMs(elapsed);

      // reminders land at 5, 10, 15… minutes untracked
      if (elapsed >= (nudgesRef.current + 1) * NUDGE_EVERY_MS) {
        nudgesRef.current += 1;
        notify(Math.round(elapsed / 60_000));
      }

      setTitle(nudgesRef.current > 0 ? `⏸ Not tracking · ${BASE_TITLE}` : BASE_TITLE);
    }

    tickRef.current = tick;
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(id);
      document.title = BASE_TITLE;
    };
  }, []);

  // starting or stopping a timer must flip the pill and title now, not up to a
  // tick later; tick() derives everything from `active`
  useEffect(() => {
    tickRef.current();
  }, [active, on]);

  const toggle = useCallback(
    async (want: boolean) => {
      setNotice(null);

      if (!want) {
        setOn(false);
        localStorage.setItem(KEY, "0");
        // switching off is the "I'm done" action — end the running session too
        if (activeRef.current) await onStopTimer();
        return;
      }

      sinceRef.current = Date.now();
      nudgesRef.current = 0;
      setOn(true);
      localStorage.setItem(KEY, "1");

      // Permission is requested here, on the click — never on mount. It is
      // deliberately not awaited: an ignored prompt would otherwise leave the
      // switch looking dead, and the tab title works without it either way.
      if (!("Notification" in window)) {
        setNotice("This browser has no notification support — using the tab title instead.");
      } else if (Notification.permission === "denied") {
        setNotice(
          "Notifications are blocked for this site — you'll still get the tab title and the pill.",
        );
      } else if (Notification.permission === "default") {
        void Notification.requestPermission().then((res) => {
          if (res !== "granted") {
            setNotice("Notifications blocked — you'll still get the tab title and the pill.");
          }
        });
      }
    },
    [onStopTimer],
  );

  const nextNudgeMs = on && !active ? (nudgesRef.current + 1) * NUDGE_EVERY_MS - untrackedMs : 0;

  return {
    on,
    toggle,
    notice,
    untrackedMs,
    nextNudgeMs: Math.max(0, nextNudgeMs),
    nudging: nudgesRef.current > 0,
  };
}

function notify(minutes: number) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification("Not tracking any task", {
      body: `Focus mode is on and you've been off the clock for ${minutes} min.`,
      tag: "ad-focus", // replaces the previous reminder instead of stacking
      silent: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // some platforms throw on construction — the tab title still carries it
  }
}
