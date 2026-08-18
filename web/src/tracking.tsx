import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, type Active, type Task } from "./api";

// Shared, app-wide view of "what is being tracked right now".
//
// The header status pill needs `active` on every tab, but the views each fetch
// /api/tasks for their own reasons. Rather than a second source of truth, views
// `publish()` what they just fetched (instant) and the provider also polls as a
// fallback for tabs that don't fetch (Reports) — both read the same endpoint, so
// they converge. `version` is the reverse channel: bumping it asks every view to
// re-fetch, which is how an idle auto-stop from the header reaches the views.
type Tracking = {
  tasks: Task[];
  active: Active | null;
  version: number;
  publish: (tasks: Task[], active: Active | null) => void;
  invalidate: () => void;
};

const POLL_MS = 20_000;

const Ctx = createContext<Tracking | null>(null);

export function TrackingProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [active, setActive] = useState<Active | null>(null);
  const [version, setVersion] = useState(0);

  const publish = useCallback((tasks: Task[], active: Active | null) => {
    setTasks(tasks);
    setActive(active);
  }, []);

  const load = useCallback(async () => {
    try {
      const { tasks, active } = await api.tasks();
      publish(tasks, active);
    } catch {
      // a failed poll is not worth surfacing — the views report their own errors
    }
  }, [publish]);

  // asking every view to re-fetch also means re-reading it here
  const invalidate = useCallback(() => {
    setVersion((v) => v + 1);
    load();
  }, [load]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    loadRef.current();
    const id = setInterval(() => loadRef.current(), POLL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <Ctx.Provider value={{ tasks, active, version, publish, invalidate }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTracking(): Tracking {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTracking must be used inside <TrackingProvider>");
  return ctx;
}
