<plan>
  <meta>
    <title>Task of the day — daily planning view</title>
    <status>completed</status>
  </meta>

  <context>
    <ref>docs/decision-log.md#2026-07-30-task-of-the-day</ref>
  </context>

  <targets>
    <file>server/db.ts</file>
    <file>server/index.ts</file>
    <file>web/src/api.ts</file>
    <file>web/src/TodayView.tsx</file>
    <file>web/src/App.tsx</file>
    <file>docs/architecture.md</file>
    <file>docs/decision-log.md</file>
  </targets>

  <out-of-scope>
    Per-day skip/dismiss of an auto-appearing recurring task (user chose plain
    auto-appear). Multi-day drag/drop planning. Any per-day notes or goals.
  </out-of-scope>

  <requirements>
    <req>`planned_for` is a LOCAL day key "YYYY-MM-DD" (a calendar date, not a timestamp) — it is deliberately not in the UTC timestamp format, since planning is a local-calendar concept.</req>
    <req>Recurring tasks auto-appear: `daily` on every day, `weekly` on the weekday of `created_at` (local). They are never written to `planned_for`.</req>
    <req>Preserve "only one active timer" — the Today view reuses the existing start/stop endpoints untouched.</req>
    <req>Tracked-today figures come from the existing `/api/report` range query; no new report endpoint.</req>
  </requirements>
</plan>

# Implementation Phases

## Phase 1 — schema + API
- [x] `db.ts`: add `planned_for TEXT` (nullable) to the tasks schema; ADD COLUMN migration for existing DBs (no CHECK change → plain `ALTER TABLE`).
- [x] `index.ts`: accept `planned_for` (day key or `null`) in POST and PATCH `/api/tasks`; validate with `/^\d{4}-\d{2}-\d{2}$/`.

## Phase 2 — frontend
- [x] `api.ts`: `planned_for: string | null` on `Task`; allow it in `update()`'s patch type.
- [x] `TodayView.tsx`: date stepper (◀ / ▶ / "Today"), planned-vs-tracked header, planned task rows with start/stop + remove-from-day, backlog chips to add.
- [x] `App.tsx`: three tabs (`today | tasks | reports`), defaulting to `today`.

## Verification
- [x] Ran the server on a throwaway `DATA_DIR` and exercised the API by curl: create-with-`planned_for`, plan, re-plan, unplan, invalid day key rejected.
- [x] Ran the server against a **copy of the real `data/app.db`** — the ADD COLUMN migration ran and existing tasks/entries survived (`planned_for: null`).
- [x] `vite build` + `tsc --noEmit` clean; `renderToString(<App/>)` renders `TodayView` without throwing.
- [ ] **Not done:** visual/click-through check in a browser — the Chrome automation extension was unresponsive (it timed out even on a trivial static page), so the rendered layout and click handlers were never eyeballed. Do a manual pass with `bun run dev`.
- [x] Updated `docs/architecture.md` (Domain, Frontend, Data-model).
- [x] Added a decision-log entry.

## Notes
- `bun run build` is broken independently of this work: `bun --cwd web install` fails with `Script not found "install"` (needs `bun install --cwd web`). Used `bunx vite build` from `web/` instead.
