# CLAUDE.md

A local, self-hosted **time tracker + to-do list**: a single **Bun** process serves both the REST API and the built React frontend; storage is one SQLite file via `bun:sqlite`. Deploys as one Docker container.

This file is the context router — keep it small (loaded every turn). Deep reference lives in `docs/`.

<rules priority="must-follow">
- **backlogs-first** — Before writing code, skim `docs/backlogs/plans/` for an existing plan covering this work; load only the relevant one. Larger features get a plan file before code (see `docs/backlogs/plans/_TEMPLATE.md`).
- **file-placement** — Plans live in `docs/backlogs/plans/{YYMMDD-slug}/plan.md` (add `-HHMM` if multiple land the same day). Durable context lives in `docs/architecture.md`; decisions in `docs/decision-log.md`. (No ADR/research/debug dirs in this LITE setup — add them if the repo grows.)
- **doc-sync** (trigger: after code changes) — Update the doc describing what you touched: `server/` → `docs/architecture.md` Backend/Data-model sections; `web/src/` → Frontend section; schema in `db.ts` → Data-model section. No-doc-needed changes (typos, formatting) are exempt.
- **decision-log** (trigger: major feature or architectural shift) — Append a compressed 3-bullet entry to `docs/decision-log.md`. Skip for bug fixes, doc-only, style, dependency bumps.
</rules>

<context-routing>
Read the must-reads for your task type; skip the rest to preserve context budget.

- **frontend** (`web/src/*.tsx`, styling, charts)
  must-read: `docs/architecture.md` (Frontend + Domain sections), `web/src/api.ts` (shared types)
  skip: Backend internals, Docker/infra. Tailwind v4 has no config file — use utility classes inline.
- **backend / api** (`server/index.ts` routing, handlers)
  must-read: `docs/architecture.md` (Backend + Domain + Timezone sections), `server/index.ts`
  skip: Frontend component internals.
- **database / schema** (editing `server/db.ts`)
  must-read: `docs/architecture.md` (Data-model + Timezone sections). The inline `CREATE TABLE IF NOT EXISTS` schema *is* the migration system — there are no migration files.
  skip: Frontend.
- **full-stack** (a feature spanning api + ui)
  must-read: all of `docs/architecture.md`, `server/index.ts`, `web/src/api.ts`
- **infra / deploy** (`Dockerfile`, `docker-compose.yml`)
  must-read: `docs/architecture.md` (Config + Deploy sections)
  skip: Domain/component detail.

Coding standards apply to every task type — see below.
</context-routing>

## Commands

Run from the repo root (Bun required; **no test suite or linter is configured**):

```bash
bun run server   # API on :3001 with --watch hot reload (server/index.ts)
bun run web      # Vite dev server on :5173, proxies /api -> :3001
bun run dev      # both together
bun run build    # installs web deps + builds frontend into web/dist
bun run start    # single process: API + web/dist on :3001 (needs a prior build)
docker compose up --build -d   # full deploy; DB persists in ./data
```

During dev use the two-server setup (`bun run web` + `bun run server`); Vite proxies `/api` to Bun.

## Coding standards (LITE — no `.claude/rules/` layer)

- Edit existing files; don't create parallel `*-enhanced` / `*-v2` versions.
- Real implementations only — no mocks/stubs left in committed code.
- Match surrounding style: TypeScript, ES modules, the hand-rolled patterns already in `server/index.ts` (no framework/router) and the typed-fetch pattern in `web/src/api.ts`.
- Keep timestamps in the UTC text format (see Timezone in `docs/architecture.md`) — easy to get wrong.
- No test/lint gate exists; before declaring done, run the relevant server/web process and exercise the change. Conventional commit messages, no AI references, never commit secrets or the `data/` DB.

## Key domain rules (must preserve when changing timer logic)

- **Only one timer runs at a time.** A `time_entries` row with `ended_at IS NULL` is the active timer. `POST /api/tasks/:id/start` runs in a transaction: `stopRunning` (close any open entry) → insert new entry → set task `doing`.
- **Marking a task `done` stops the running timer** (PATCH handler).
- **Durations are computed in SQL**, never stored: `julianday(ended_at) - julianday(started_at)`.
- **Reports clip entries to the requested range** and treat a still-running entry's `ended_at` as "now".

Full detail (architecture, data model, timezone, config) → `docs/architecture.md`.

<implementation-status>
- No automated tests, no linter, no CI — verification is manual (run the app).
- `db.ts` schema is the only migration mechanism; changing columns on an existing DB needs manual handling (`data/app.db` is not auto-migrated).
- Single-user / single-process assumption: "only one timer at a time" is global, not per-user (there is no auth or user concept).
</implementation-status>
