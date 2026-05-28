// Compact duration: 3725 -> "1h 2m", 45 -> "45s", 0 -> "0s"
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Planned duration in minutes: 90 -> "1h30m", 45 -> "45m", 120 -> "2h"
export function formatMinutes(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

// Parse a human duration ("1h30m", "90", "2h", "45m") into minutes. null if empty/invalid.
export function parseMinutes(v: string): number | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s); // bare number = minutes
  const m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return (Number(m[1] ?? 0)) * 60 + Number(m[2] ?? 0);
}

// Live clock for the running timer: 3725 -> "01:02:05"
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ISO week key, e.g. "2026-W22"
export function localWeekKey(d: Date): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (date.getDay() + 6) % 7; // Mon=0
  date.setDate(date.getDate() - day + 3); // nearest Thursday
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getDay() + 6) % 7)) /
        7,
    );
  return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
}
