<plan>
  <meta>
    <title>Focus mode — nudge when not tracking</title>
    <status>completed</status>
  </meta>

  <context>
    <ref>docs/decision-log.md#2026-08-18-focus-mode</ref>
    <ref>web/src/useIdleAutoStop.ts (the mirror-image feature: idle -> stop)</ref>
  </context>

  <targets>
    <file>web/src/tracking.tsx</file>
    <file>web/src/useFocusMode.ts</file>
    <file>web/src/TrackingStatus.tsx</file>
    <file>web/src/App.tsx</file>
    <file>web/src/TodayView.tsx</file>
    <file>web/src/TasksView.tsx</file>
    <file>docs/architecture.md</file>
    <file>docs/decision-log.md</file>
  </targets>

  <out-of-scope>
    Server changes of any kind — no schema, no endpoint, no migration of data/app.db.
    Service worker / Web Push (would be needed to nudge with the browser closed).
    In-page nudge banner and nudge sound (explicitly declined; pill + title + OS notification only).
  </out-of-scope>

  <requirements>
    <req>Presence is DECLARED, not detected — focus mode has no idle detection of its own. Reminders fire whenever it's on and no timer runs.</req>
    <req>Switching focus mode off stops the running timer: "I'm done" and "stop nagging me" are the same action (this is why there is no snooze).</req>
    <req>Fixed 5-minute reminder cadence, counted from the timer stopping or focus mode switching on.</req>
    <req>Channels are OS notification + document.title only. The header pill is ambient status, not a notification channel.</req>
    <req>Notification.requestPermission() on the switch gesture, never on mount, and NOT awaited — an ignored prompt must not leave the switch looking dead.</req>
    <req>Compute elapsed time from Date.now() deltas, never by counting setInterval ticks (hidden tabs throttle to ~1/min).</req>
    <req>The two flags render as identical switch rows — they are a matched pair, not one feature plus a leftover checkbox.</req>
  </requirements>
</plan>

# Implementation Phases

## Phase 1 — Shared tracking state
- [x] `tracking.tsx`: provider owning `{ tasks, active }`, polling `/api/tasks`, plus `publish()` (views push fresh data instantly) and `version` (bump -> views re-fetch).
- [x] Wrap `App` in the provider.

## Phase 2 — Reminder engine
- [x] `useFocusMode.ts`: on/off flag + 5-min reminder clock + OS notification + `document.title` + stop-timer-on-off.

## Phase 3 — Header pill + popover
- [x] `TrackingStatus.tsx`: live status pill; popover hosting both flags as identical `role="switch"` rows; stop / resume-last-task actions.
- [x] Remove the duplicated auto-stop checkbox rows from `TodayView` and `TasksView`; wire both to the provider.

## Verification
- [x] Ran `bun run dev` and exercised: nudge fires after grace, snooze, off-for-today, quiet hours, permission denial, auto-stop still works from the popover.
- [x] Updated `docs/architecture.md` Frontend section (doc-sync).
- [x] Added a decision-log entry.
