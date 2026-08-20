# Decision log

> Read this when you need the *why* behind a structural choice, or before reversing one. Append-only.

**Format.** Newest first. One entry per major feature or architectural shift — exactly three bullets:

- **Decision** — what was chosen, in one line.
- **Why** — the driving constraint or trade-off.
- **Implications** — what this commits us to / what it rules out.

Skip entries for bug fixes, doc-only changes, style tweaks, and dependency bumps. (This LITE setup has no separate ADR files; if rationale grows long, link out from the bullet.)

## 2026-08-21 — Renamed to Zeitgeber; flags in the open; reports split by kind of task

- **Decision** — Renamed the app **Activity Detector → Zeitgeber** (UI, tab title, README, package names; infra names deliberately unchanged). Moved focus mode and auto-stop out of the `TrackingStatus` popover into always-visible header chips and **deleted the header status badge/popover entirely**, and rebuilt `ReportsView` as a fixed **Today** breakdown — the only thing it shows by default — plus an on-demand range (week → year) whose trend chart and per-task totals are split into recurring vs one-off, drawn as horizontal rows rather than a column table. `/api/report` now also returns each entry's `recurrence`.
- **Why** — Frequency decides what gets revealed and what gets hidden, in both directions. The flags are flipped many times a day, so a click-to-reveal popover taxed the most frequent gesture; hiding them was the wrong end of the frequency/space trade. Opening Reports is nearly always a "how's today going?" question, so the reverse applies there — the day stands alone and the look-back is one click away instead of something to scroll past. The status badge lost by the same measure: it restated what the Today row already showed, so it was a second place for the same fact to go stale. "Activity Detector" described a mechanism nobody needed named; a zeitgeber is the external cue that entrains a rhythm, which is what focus mode actually is. On the report side, "how is today going?" and "how has the last N months gone?" are different questions that were sharing one range control, and an hour of routine reads differently from an hour of project work — a split the old single-colour chart and task table couldn't show. Rows suit task names (no rotated labels, no width limit on the list).
- **Implications** — The header now carries three controls before the tab nav and relies on wrapping at narrow widths. The flags stay a matched pair — any third flag belongs in the popover, not as a fourth chip. Kind is derived from `recurrence`, not `status`, because a ticked-off recurring task is `done` for the day; anything else splitting recurring work must use the same rule. All report ranges must keep ending today, or the Today card can no longer reuse the same fetch; with no range picked the fetch is today's window alone, so the default view never pulls a year of entries. The two series colours are fixed categorical slots (validated for colour-vision deficiency) and must not be reassigned by rank. `TrackingStatus` renders no status of its own, so it must stay mounted in the header purely to host the two hooks — removing it from `App.tsx` would silently kill reminders and idle auto-stop. The repo folder, compose service, `container_name` and nginx upstream keep the old name on purpose; the deployment and git remote were not worth churning for a label.

---

## 2026-08-18 — Vanity domain moved under `.localhost`

- **Decision** — Renamed the local reverse-proxy host from `vinh.todo` to **`vinhtruong.localhost`** (`nginx/vinhtruong.localhost.conf`, mount updated in `docker-compose.yml`). Plain HTTP on port 80 as before — no TLS added.
- **Why** — Idle auto-stop never worked through the proxy: `IdleDetector` (and `Notification.requestPermission`) require a *secure context*, which Chrome grants only to HTTPS origins plus `localhost`, `127.0.0.1`, and `*.localhost`. `http://vinh.todo` was an insecure origin, so `window.IdleDetector` was undefined and the hook silently switched itself off. Moving under `.localhost` buys the secure context for free; the alternative was a locally-trusted cert (`mkcert`) — real work for a single-user local deploy, and Let's Encrypt can't issue for a made-up TLD anyway.
- **Implications** — The vanity name is now constrained: any future rename must stay under `.localhost` or the deploy must move to HTTPS, or the browser-API features break again. `*.localhost` resolves to loopback without an `/etc/hosts` entry on macOS and Chrome, so the hosts line is now optional. This only fixes same-machine access — reaching the app from another device still needs TLS for these features. The old `vinh.todo` name is fully retired: a `default_server` catch-all now `return 444`s any Host header not in `server_name`, so unlisted hostnames are refused rather than silently served.

---

## 2026-08-18 — Focus mode (forgot-to-track reminder)

- **Decision** — Added an opt-in **focus mode** (`web/src/useFocusMode.ts`): while on and no timer is running it reminds every 5 min via OS notification + tab title, and switching it **off** stops the running timer. It sits beside the pre-existing idle auto-stop as a matched pair of switches in a new header status pill + popover (`TrackingStatus.tsx`), backed by an app-wide `{ tasks, active }` context (`tracking.tsx`). The duplicated auto-stop checkbox was removed from `TodayView` and `TasksView`. Entirely client-side — no schema, endpoint, or server change.
- **Why** — The two flags are complements (auto-stop closes a timer you forgot to stop; focus mode chases one you forgot to start), so they were designed and placed together. Presence is **declared rather than detected**: an earlier iteration gated reminders on the Idle Detection API so they'd pause when you stepped away, but that added a Chrome-only permission and a lot of machinery (grace period, quiet hours, decaying escalation) to guess something the user can state directly. Switching focus mode off doubles as both "I'm done" and "stop nagging me", which removes the need for snooze entirely.
- **Implications** — Reminders only work with the tab open (no service worker / Web Push) and will fire while you're away unless you switch focus mode off — that is the accepted trade for the simpler model. Preferences are browser-local, so they don't sync across devices and aren't in the DB. Views no longer own the flags; anything needing `active` app-wide should use `useTracking()` rather than fetching separately. Auto-stop remains the only feature requiring the Idle Detection API.

---

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
