# Architecture

> Read this for **every** task — it's the always-on backbone. Jump to the section your task type points at (see `CLAUDE.md` `<context-routing>`).

## Product & domain

A local, self-hosted **time tracker + to-do list**. You create tasks, start a timer on one, and later view reports of where time went. Single-user, no auth.

Core nouns:

- **Task** — a to-do item with `status` ∈ `todo | doing | done | recurring` (CHECK-constrained in the schema), a `recurrence` ∈ `none | daily | weekly` (only meaningful when status = `recurring`), and a `duration_minutes` planned/estimate duration (default 90 = 1h30m, editable inline in the table; display-only, no timer interaction).
- **TimeEntry** — a row in `time_entries` with `started_at` and a nullable `ended_at`. An entry with `ended_at IS NULL` is the **active timer**.
- **Active timer** — there is at most **one** open `time_entry` across the whole DB at any moment.
- **Duration** — never stored; computed in SQL as `julianday(ended_at) - julianday(started_at)` (×86400 for seconds).
- **Report** — durations aggregated over a requested date range, clipping entries to the range and treating a still-running entry's end as "now".

## Stack overview

| Layer | Tech |
| --- | --- |
| Runtime | Bun (one process serves API + static frontend) |
| Backend | `Bun.serve`, hand-rolled path routing, `bun:sqlite` |
| Frontend | React 18, Vite, Tailwind v4 (`@tailwindcss/vite`, no config file), Recharts |
| Storage | Single SQLite file (`app.db`), WAL mode, foreign keys on |
| Deploy | Docker (single container), DB persisted to a host volume |

No test framework, no linter, no migration tool, no CI.

## Boundaries & how they talk

```
web/src (React, :5173 dev)  --HTTP /api/*-->  server/index.ts (Bun.serve, :3001)  -->  bun:sqlite (data/app.db)
```

- **Dev:** Vite (`:5173`) proxies `/api` to the Bun server (`:3001`). Two processes.
- **Prod:** one Bun process serves `web/dist` static files AND `/api/*` on `:3001`.
- The only contract between frontend and backend is the JSON REST API under `/api/*`; shared TypeScript types live in `web/src/api.ts` (`Task`, `Active`, `ReportEntry`).

## Backend — `server/` (two files)

- **`db.ts`** — opens/creates the SQLite DB, sets WAL + foreign keys, runs the `CREATE TABLE IF NOT EXISTS` schema **inline**. This *is* the migration system; there are no migration files — edit the schema here. Changing columns on an existing `data/app.db` requires manual migration.
- **`index.ts`** — a single `Bun.serve` handler. `/api/*` routes through `handleApi` (path matching on `pathname` segments, **no framework/router**); everything else falls through to `serveStatic`, which serves `web/dist` and falls back to `index.html` for SPA routing.

### Timer logic (must preserve)

- `POST /api/tasks/:id/start` runs in a transaction: `stopRunning` (close any open entry) → insert new `time_entry` → set task `status = 'doing'`.
- Marking a task `done` (PATCH) stops the running timer.
- Reports clip entries to the requested range; in-progress entries count up to "now".

## Frontend — `web/src/`

- `App.tsx` — two-tab shell: `TasksView` and `ReportsView`.
- `api.ts` — typed fetch wrapper **and** the source of shared types. Add new API calls + types here.
- `format.ts` — time/date display helpers.
- Tailwind v4 has **no config file**; use utility classes inline. Charts via Recharts.

## Data model

- `tasks` — `id`, `status` (`todo|doing|done|recurring`), `recurrence` (`none|daily|weekly`), `duration_minutes` (INTEGER, default 90), plus title/timestamps. `status` and `recurrence` are CHECK-constrained.
  - **Migration note:** because SQLite can't ALTER a CHECK constraint, `db.ts` detects a pre-`recurring` tasks table (by scanning its stored DDL) and rebuilds it (rename → recreate → copy → drop) under `legacy_alter_table=ON` + `foreign_keys=OFF` so `time_entries`' FK text keeps pointing at `tasks`. This runs once per old DB; fresh DBs skip it.
- `time_entries` — `id`, `task_id` (FK), `started_at`, `ended_at` (nullable; NULL = active).
- All timestamps are stored as **UTC text** (see below). `total_seconds` and report figures are computed, not columns.

## Timezone convention (easy to get wrong)

All timestamps are stored as **UTC** in the SQLite text format `"YYYY-MM-DD HH:MM:SS"` (produced by `nowSQL()` on the server). The frontend sends ISO UTC strings and uses `parseUTC()` (in `api.ts`) to convert to `Date`; all local rendering and per-day/per-week bucketing happens client-side in the browser's local timezone. Keep new timestamps in this exact UTC text format.

## Configuration (env vars)

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port |
| `DATA_DIR` | `data` | Directory holding `app.db` (Docker uses `/data`, a mounted volume) |
| `STATIC_ROOT` | `web/dist` | Built frontend to serve |

## Deploy

`docker compose up --build -d` builds the frontend and runs the single Bun process; the SQLite DB persists in `./data` on the host. `bun run start` is the non-Docker equivalent and requires a prior `bun run build` (else it serves a "frontend not built" message).
