import { useEffect, useRef, useState } from "react";
import { api, parseUTC, type Active } from "./api";

// Auto-stop the running timer after this much system-wide inactivity (keyboard,
// mouse, or screen lock), detected via the browser Idle Detection API.
export const IDLE_THRESHOLD_MS = 15 * 60 * 1000;
const AUTOSTOP_KEY = "ad-autostop";

type Options = {
  active: Active | null;
  onStopped: () => void | Promise<void>;
  onError?: (msg: string) => void;
};

// Shared idle auto-stop: when enabled, watch system-wide idle / screen lock. On
// idle, stop the running timer and backdate the stop to when inactivity began.
// The on/off choice lives in localStorage so every view agrees on it.
export function useIdleAutoStop({ active, onStopped, onError }: Options) {
  const [autoStop, setAutoStop] = useState(
    () => localStorage.getItem(AUTOSTOP_KEY) === "1",
  );
  const [idleMsg, setIdleMsg] = useState<string | null>(null);

  // keep the latest active entry / callbacks reachable from the event listener
  // without re-subscribing the detector on every render
  const activeRef = useRef(active);
  activeRef.current = active;
  const stoppedRef = useRef(onStopped);
  stoppedRef.current = onStopped;
  const errorRef = useRef(onError);
  errorRef.current = onError;

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
            setIdleMsg(
              `Auto-stopped — idle since ${new Date(stopMs).toLocaleTimeString()}.`,
            );
            await stoppedRef.current();
          } catch (e: any) {
            errorRef.current?.(e.message);
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

  return { autoStop, toggleAutoStop, idleMsg };
}
