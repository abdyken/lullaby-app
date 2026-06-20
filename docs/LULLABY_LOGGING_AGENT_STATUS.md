# Lullaby Logging Agent Status

AUTOPILOT_STATUS: RUNNING

## Source of truth

- `docs/LULLABY_LOGGING_IMPLEMENTATION_PLAN_EN.md`
- `docs/LULLABY_LOGGING_MVP_AUDIT.md` (Phase 0 audit output — read before refactoring)

## Current phase

Phase 0 — Audit complete. Next: Phase 1 foundation (shared types).

## Task queue

- [x] 00. Audit existing MVP structure
- [x] 01. Identify current navigation, state management, storage, and logging code
- [ ] 02. Create or adapt shared logging event TypeScript models
- [ ] 03. Create logging repository/service layer
- [ ] 04. Add active session model for timestamp-based timers
- [ ] 05. Implement Feed flow: breast + bottle
- [ ] 06. Implement Sleep flow: start/stop session
- [ ] 07. Implement Diaper quick-log flow
- [ ] 08. Implement Pump flow: side + timer + optional volume
- [ ] 09. Integrate all events into Today timeline
- [ ] 10. Add Undo behavior
- [ ] 11. Add active session recovery after app restart
- [ ] 12. Add validation and edge-case handling
- [ ] 13. Add or update tests
- [ ] 14. Run final verification
- [ ] 15. Final cleanup and implementation summary

## Completed tasks

- **00 + 01 — Audit existing MVP (one logical "audit" unit).** Mapped the full
  stack, navigation/providers, the single `TonightState { events, orbView }`
  store, every Feed/Sleep/Diaper/Pump/Note creation path, active-timer storage,
  local + Supabase storage keys/payloads, timeline dependencies, and the
  field-by-field mapping to the target `CareEvent` model. Confirmed there is no
  analytics, no notifications, and no feature-flag system. Wrote
  `docs/LULLABY_LOGGING_MVP_AUDIT.md` with a prioritized gap analysis. No app
  code changed (docs-only).

## Current task

02. Create or adapt shared logging event TypeScript models (plan Phase 1.1) —
build the discriminated `CareEvent` union + `Clock` + validators **beside** the
existing `LogEvent` (do not delete the old model yet).

## Decisions made

- Treated audit tasks 00 and 01 as a single logical "audit" run, delivered as one
  document, because they are two halves of the same Phase 0 audit.
- **Refactor in place, don't rewrite.** The MVP's pure-logic + thin-React +
  `EventRepository` boundary is a good fit for the plan's layering; we extend it.
- Keep the existing `LogEvent`/`note` type as an out-of-scope extension; the new
  union targets feed/sleep/diaper/pump only.
- New model fields can land without a destructive Supabase migration: `events.id`
  is `text` and `events.meta` is JSONB.
- `loggingV2` feature flag will be introduced when the new domain module is
  created (task 02+), not during the audit.

## Known issues (found during audit, to fix in later tasks)

- **Sleep finish is hardcoded to +72 min** (`SLEEP_FINALIZE_MIN` /
  `endRunningSleep`, `src/data/mock.ts:214,354`) instead of `endedAt = now`.
  Highest-priority behavioral fix for the Sleep flow (task 06).
- No independent sessions: a single `orbView` cannot model concurrent
  sleep + pump (needed by plan Phase 4).
- No `useElapsedTime` ticking hook and no `AppState` foreground reconciliation
  (plan §6 / Phase 4).
- Diaper has no `dry`; quick-log is 3 taps, not 2. Pump drops `both` and captures
  no volume. Bottle captures no volume/milk type. Breast has no real timers or
  side segments.
- Undo is delete-newest only (no `UndoableMutation` snapshot / undo-finish).

## Last verification

- 2026-06-21 — `npx tsc --noEmit` → exit 0 (no `typecheck` script exists; `tsc`
  used directly). `npm run check:local-interactions` → all 60 checks pass.
  `npm test` not available (no runner; smoke test is the substitute). This task
  is docs-only, so no app behavior changed.

## Final result

Not finished.