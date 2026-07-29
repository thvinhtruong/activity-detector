# Decision log

> Read this when you need the *why* behind a structural choice, or before reversing one. Append-only.

**Format.** Newest first. One entry per major feature or architectural shift — exactly three bullets:

- **Decision** — what was chosen, in one line.
- **Why** — the driving constraint or trade-off.
- **Implications** — what this commits us to / what it rules out.

Skip entries for bug fixes, doc-only changes, style tweaks, and dependency bumps. (This LITE setup has no separate ADR files; if rationale grows long, link out from the bullet.)

## 2026-07-30 — Task of the day (day planning)

- **Decision** — Added `tasks.planned_for` (nullable **local** day key `"YYYY-MM-DD"`) plus a third `Today` tab (`web/src/TodayView.tsx`, now the default tab) that shows one day's plan with planned-vs-tracked totals and a backlog picker. Recurring tasks auto-appear (daily → every day, weekly → the weekday of `created_at`) and never store a `planned_for`.
- **Why** — The flat task list couldn't answer "what should I do today?". A single date column on `tasks` (rather than a `day_plans` join table) keeps the single-user model and existing endpoints unchanged; derived recurring appearance avoids a scheduler that materializes rows per day.
- **Implications** — `planned_for` is deliberately **not** in the UTC timestamp format — it's a local calendar date, so day boundaries follow the browser's timezone (consistent with existing client-side per-day bucketing). A task has at most one planned day; re-planning moves it. Recurring appearance can't be dismissed for a single day, and per-day tracked time is read from the existing `/api/report` range query rather than a new endpoint.

---

## 2026-05-27 — Task duration + recurring status

- **Decision** — Added `duration_minutes` (planned estimate, default 90, inline-editable, display-only) and a `recurring` status backed by a `recurrence` field (`none|daily|weekly`) to `tasks`.
- **Why** — Users wanted a planned duration per task and a way to mark daily/weekly habit tasks; chose `recurring` as a literal 4th status value (over a derived/auto-resetting model) for simplicity and manual control.
- **Implications** — The status CHECK changed, so `db.ts` now carries a one-time table-rebuild migration for pre-existing DBs (CHECK constraints can't be ALTERed). `recurrence` is only meaningful when status=`recurring`; nothing auto-resets it per period — it's a manual badge, not a scheduler.

## 2026-05-27 — Context-engineering scaffold (LITE)

- **Decision** — Added `CLAUDE.md` context router + `docs/architecture.md` + this log + `docs/backlogs/plans/` for AI-session context routing.
- **Why** — Keep per-turn context minimal and well-routed; stop re-deriving the codebase each session. LITE chosen because the repo is small/early.
- **Implications** — `CLAUDE.md` stays lean (loaded every turn); deep detail lives in `docs/architecture.md`. No `.claude/rules/`, ADRs, or priority buckets yet — promote to FULL mode if the repo grows.

## (seed) — Initial architecture

- **Decision** — Single Bun process serves both REST API and built React frontend; SQLite via `bun:sqlite`; inline `CREATE TABLE` schema as the only migration mechanism.
- **Why** — Local single-user tool; minimize moving parts (no native deps, no DB server, one deployable container).
- **Implications** — No multi-user/auth model; "one active timer" is global; schema changes on an existing DB are manual.
