import { useState } from "react";
import TasksView from "./TasksView";
import ReportsView from "./ReportsView";

type Tab = "tasks" | "reports";

export default function App() {
  const [tab, setTab] = useState<Tab>("tasks");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <span className="text-xl">⏱️</span> Activity Detector
          </h1>
          <nav className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(["tasks", "reports"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                  tab === t
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">
        {tab === "tasks" ? <TasksView /> : <ReportsView />}
      </main>
    </div>
  );
}
