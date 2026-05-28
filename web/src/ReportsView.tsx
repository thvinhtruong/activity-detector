import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, parseUTC, type ReportEntry } from "./api";
import { formatDuration, localDayKey, localWeekKey } from "./format";

type Preset = "7d" | "14d" | "30d" | "thisWeek";
type Granularity = "day" | "week";

function rangeFor(preset: Preset): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (preset === "7d") from.setDate(from.getDate() - 6);
  else if (preset === "14d") from.setDate(from.getDate() - 13);
  else if (preset === "30d") from.setDate(from.getDate() - 29);
  else if (preset === "thisWeek") {
    const day = (from.getDay() + 6) % 7; // Mon=0
    from.setDate(from.getDate() - day);
  }
  return { from, to };
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "thisWeek", label: "This week" },
];

export default function ReportsView() {
  const [preset, setPreset] = useState<Preset>("7d");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = rangeFor(preset);
      const r = await api.report(from, to);
      setEntries(r.entries);
      setGenerated(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // seconds per bucket (local time) and per task
  const { buckets, byTask, total } = useMemo(() => {
    const buckets = new Map<string, number>();
    const byTask = new Map<number, { title: string; seconds: number }>();
    let total = 0;
    for (const e of entries) {
      const start = parseUTC(e.started_at);
      const secs = (parseUTC(e.ended_at).getTime() - start.getTime()) / 1000;
      if (secs <= 0) continue;
      total += secs;
      const key = granularity === "day" ? localDayKey(start) : localWeekKey(start);
      buckets.set(key, (buckets.get(key) ?? 0) + secs);
      const cur = byTask.get(e.task_id) ?? { title: e.title, seconds: 0 };
      cur.seconds += secs;
      byTask.set(e.task_id, cur);
    }
    return { buckets, byTask, total };
  }, [entries, granularity]);

  const chartData = useMemo(
    () =>
      [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, seconds]) => ({
          label: granularity === "day" ? key.slice(5) : key, // MM-DD
          hours: +(seconds / 3600).toFixed(2),
        })),
    [buckets, granularity],
  );

  const taskRows = useMemo(
    () => [...byTask.values()].sort((a, b) => b.seconds - a.seconds),
    [byTask],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                preset === p.key
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(["day", "week"] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                granularity === g
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              By {g}
            </button>
          ))}
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {loading ? "Generating…" : "Generate"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Time tracked
          </h2>
          <span className="text-sm text-slate-500">
            Total: <span className="font-mono">{formatDuration(total)}</span>
          </span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                fontSize={12}
                tickLine={false}
                axisLine={false}
                unit="h"
                allowDecimals
              />
              <Tooltip
                formatter={(v: number) => [`${v} h`, "Time"]}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="hours" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {chartData.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            {generated
              ? "No tracked time in this range."
              : "Pick a range and click Generate."}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-2.5 font-medium">Task</th>
              <th className="px-4 py-2.5 text-right font-medium">Time spent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {taskRows.map((r) => (
              <tr key={r.title}>
                <td className="px-4 py-2.5">{r.title}</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-500">
                  {formatDuration(r.seconds)}
                </td>
              </tr>
            ))}
            {taskRows.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                  {generated ? "Nothing tracked yet." : "Click Generate to load your report."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
