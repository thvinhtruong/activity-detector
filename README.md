# Activity Detector

A local, self-hosted time tracker & to-do list. Track time per task with a
live start/stop timer, switch task status (todo → doing → done) from a table,
and see how much time you spend over a range of days or weeks.

- **Runtime:** [Bun](https://bun.sh) — one process serves the REST API *and* the built frontend
- **Frontend:** React + Vite + Tailwind v4 + Recharts
- **Storage:** SQLite (`bun:sqlite`, no native deps) — a single file under `data/`
- **Deploy:** one Docker container

## Features

- **Table view** of all tasks with inline title editing and a status dropdown.
- **Live timer** — click ▶ Start on a task; starting another auto-stops the first
  (only one task tracks at a time). Marking a task **done** stops the timer.
- **Reports** — bar chart of time tracked, filterable by range (last 7/14/30 days,
  this week) and grouped **by day** or **by week**, plus a per-task time breakdown.

## Run with Docker (recommended)

```bash
docker compose up --build -d
```

Open http://localhost:3001 . Your database lives in `./data/app.db` on the host
(mounted volume), so it survives container rebuilds.

## Run locally (dev, with hot reload)

Two terminals:

```bash
# terminal 1 — API on :3001 (auto-restarts on change)
bun run server

# terminal 2 — Vite dev server on :5173 (proxies /api to :3001)
bun --cwd web install   # first time only
bun run web
```

Open http://localhost:5173 .

## Run locally (production-style, single process)

```bash
bun run build      # build the frontend into web/dist
bun run start      # Bun serves API + web/dist on :3001
```

## Configuration

| Env var       | Default     | Purpose                          |
| ------------- | ----------- | -------------------------------- |
| `PORT`        | `3001`      | HTTP port                        |
| `DATA_DIR`    | `data`      | Directory for the SQLite file    |
| `STATIC_ROOT` | `web/dist`  | Built frontend to serve          |

## API

| Method & path             | Description                                  |
| ------------------------- | -------------------------------------------- |
| `GET /api/tasks`          | All tasks (with `total_seconds`) + active timer |
| `POST /api/tasks`         | Create `{ title }`                           |
| `PATCH /api/tasks/:id`    | Update `title` / `description` / `status` / `archived` |
| `DELETE /api/tasks/:id`   | Delete a task (and its time entries)         |
| `POST /api/tasks/:id/start` | Start tracking (auto-stops any running task) |
| `POST /api/stop`          | Stop the running timer                       |
| `GET /api/report?from=&to=` | Time entries (ISO UTC range) for charts    |

## Data model

- `tasks(id, title, description, status, archived, created_at, updated_at)`
- `time_entries(id, task_id, started_at, ended_at)` — `ended_at IS NULL` = running

Timestamps are stored as UTC (`YYYY-MM-DD HH:MM:SS`); the frontend renders and
buckets them in your local timezone.
