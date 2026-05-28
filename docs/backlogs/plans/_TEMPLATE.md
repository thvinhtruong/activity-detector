<plan>
  <meta>
    <title>SHORT TITLE</title>
    <status>not_started</status> <!-- not_started | in_progress | completed -->
  </meta>

  <context>
    <!-- Links to background. In LITE mode usually just the decision-log entry; add research/debug links if you create them. -->
    <ref>docs/decision-log.md#YYYY-MM-DD-...</ref>
  </context>

  <targets>
    <!-- Files this plan will create or modify. Keep accurate as the plan evolves. -->
    <file>server/index.ts</file>
    <file>server/db.ts</file>
    <file>web/src/api.ts</file>
  </targets>

  <out-of-scope>
    <!-- Optional: things explicitly NOT in this plan, to prevent scope creep. -->
  </out-of-scope>

  <requirements>
    <!-- PLAN-SPECIFIC constraints only. Anything that would apply to the next feature
         belongs in CLAUDE.md's Coding standards, not here. -->
    <req>Preserve "only one active timer" invariant (start runs stopRunning first).</req>
    <req>Keep new timestamps in UTC text format "YYYY-MM-DD HH:MM:SS".</req>
  </requirements>
</plan>

# Implementation Phases

## Phase 1 — <name>
- [ ] step
- [ ] step

## Phase 2 — <name>
- [ ] step

## Verification
- [ ] Ran the affected process (`bun run dev` / `bun run server`) and exercised the change manually (no test suite exists).
- [ ] Updated `docs/architecture.md` for any touched area (doc-sync rule).
- [ ] Added a decision-log entry if this was a major/architectural change.

---

<!--
Usage:
- Copy this dir to docs/backlogs/plans/{YYMMDD-slug}/plan.md (add -HHMM if multiple land the same day).
- <status> is the source of truth for progress — keep it current.
- Keep <targets> accurate as scope shifts.
- When complete, set <status>completed</status>. (In FULL mode you'd move the dir to done/ and update INDEX.md; LITE has no INDEX yet.)
-->
