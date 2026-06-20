# Lullaby Logging Agent Status

AUTOPILOT_STATUS: RUNNING

## Source of truth

- `docs/LULLABY_LOGGING_IMPLEMENTATION_PLAN_EN.md`
- `docs/LULLABY_LOGGING_MVP_AUDIT.md` (Phase 0 audit output — read before refactoring)

## Current phase

Phase 1.3 — Store/state + timer helpers complete. The active-session model now
has distinct `activeSleep`/`activeBreastFeed`/`activePump` slots (`loggingStore`),
session selectors, `hydrateLoggingState` (launch) + `reconcileLoggingState`
(foreground), and the timestamp-based timer helpers (`sessionMath` +
`useElapsedTime`). The Phase 1 foundation (plan §13 PR 1–2 + the Phase 4
session-engine STATE) is in place; the React provider, the live `AppState`
subscription, and the start/finish/cancel use-cases land with the flows. Next:
status task 05 "Feed flow: breast + bottle" — the first UI + application layer on
top of the repository + store + session model, behind the `loggingV2` flag.

## Task queue

- [x] 00. Audit existing MVP structure
- [x] 01. Identify current navigation, state management, storage, and logging code
- [x] 02. Create or adapt shared logging event TypeScript models
- [x] 03. Create logging repository/service layer
- [x] 04. Add active session model for timestamp-based timers
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
- **02 — Shared logging event model (Phase 1.1).** Added the `src/features/logging`
  module BESIDE the legacy `LogEvent` (nothing wired into the app yet):
  - `domain/types.ts` — the discriminated `CareEvent` union
    (`BreastFeedEvent` / `BottleFeedEvent` / `SleepEvent` / `DiaperEvent` /
    `PumpEvent`) on `CareEventBase`, plus `BreastSideSegment`, `PumpVolumeDraft`,
    `UndoableMutation`, alias unions (sides/kinds/milk/sleep type), and type
    guards (`isBreastFeed`, `isBottleFeed`, `isSleepEvent`, `isDiaperEvent`,
    `isPumpEvent`, `isActiveSession`).
  - `domain/ids.ts` — `newUuid()` (v4, prefers `crypto.randomUUID`, Math.random
    fallback) and `newClientEventId()` for idempotent retries.
  - `domain/errors.ts` — serializable `LoggingError` + `loggingError()` factory.
  - `domain/rules.ts` — the five plan validators (`validateBottleAmount`,
    `validateSessionRange` with optional future-start guard, `validateBreastSegments`,
    `validatePumpVolumes`, `validateDiaperKind`) returning `ValidationResult`
    (no throws — errors flow into store state per plan §6).
  - `timer/clock.ts` — `Clock` + `systemClock` + `createManualClock()` (fake clock
    for session tests, plan §11.1).
  - `index.ts` — public-API barrel (plan §2.3).
  - Extended the smoke test with 10 checks (U1–U10) covering the clock, ids,
    every validator branch, and guard narrowing → suite now 70/70.
- **03 — Repository/service layer (Phase 1.2).** Added the `loggingV2` feature
  flag and the data layer, still additive (nothing wired into the running app):
  - `config/featureFlags.ts` — `isLoggingV2Enabled()` (runtime override →
    `EXPO_PUBLIC_LOGGING_V2` env → `false` default), `setLoggingV2Enabled`,
    `resolveLoggingFlags`, `resetLoggingFlags`.
  - `data/LoggingRepository.ts` — the plan §5 interface (`getTodayEvents`,
    `getActiveSessions`, `createEvent`, `updateEvent`, `softDeleteEvent`,
    `enqueueSync`) + `TodayEventsQuery`/`ActiveSessionsQuery`.
  - `data/loggingPersistence.ts` — pure (Node-safe) `LoggingPersistencePort`,
    `LoggingSnapshot`, serialize/parse with per-row structural validation,
    `LOGGING_STORAGE_KEY = lullaby/logging-v2/v1`, and an in-memory port for tests.
  - `data/LoggingRepositoryImpl.ts` — `createLoggingRepository(port, clock)`:
    idempotent create by `clientEventId`, `version`/`updatedAt` stamping on
    update, soft-delete, today-window read (same local day, newest first, excl.
    deleted/cancelled), active-session read (sleep/breast by child, pump by
    caregiver). No ticking counter persisted (plan §5).
  - `data/LegacyLoggingMapper.ts` — `legacyEventToCareEvent` /  `mapLegacyEvents`
    (forward, per audit §10; notes → null) + best-effort `careEventToLegacyEvent`
    reverse skeleton for the eventual migration write-path.
  - `data/loggingStorage.ts` — the device-only AsyncStorage port +
    `createDeviceLoggingRepository()`; kept OUT of the barrel so `index.ts` stays
    Node-runnable.
  - Extended the smoke test with 9 checks (V1–V9) → suite now **79/79**.
- **04 — Active-session model + timestamp-based timers (Phase 1.3 store + §6 /
  Phase 4 session-engine state).** Added the state/selectors/hydration layer and
  the timer helpers, still additive (nothing wired into the running app yet):
  - `timer/sessionMath.ts` — pure, clock-free duration math: `elapsedMs`
    (running → `now`, completed → `endedAt`, clamps a backwards clock to 0),
    `isReversedRange` (clock-change detector), `sessionElapsedMs`,
    `breastSegmentTotals` (per-side; the open segment counts up to `now`), and
    `formatClock`/`formatCompactDuration`. No persisted counter anywhere.
  - `timer/useElapsedTime.ts` — display-only React hook: derives elapsed during
    render from `startedAt`, ticking once/sec while active (no stored counter, no
    setState-in-effect). React-only → imported directly, kept out of the barrel.
  - `timer/appStateReconcile.ts` — thin `subscribeForeground` over RN `AppState`
    (the seam the provider calls on foreground). RN-only → out of the barrel.
  - `state/loggingStore.ts` — the plan §1.3 `LoggingState` with distinct
    `activeSleep`/`activeBreastFeed`/`activePump` slots (the audit's central gap:
    one `orbView` cannot model concurrent sessions) + pure transitions
    (`applyTodayEvents`, `applyActiveSessions`, `withError`, `clearError`,
    `withPumpVolumeDraft`, `withLastMutation`, `setHydrated`).
  - `state/loggingSelectors.ts` — active-session selectors (pump scoped to the
    caregiver, not the child) + `selectIsAnySessionActive`/`selectSessionElapsedMs`.
  - `state/loggingHydration.ts` — `hydrateLoggingState` (launch read → restore
    timers from stored timestamps) + `reconcileLoggingState` (foreground re-read;
    drops a session finished elsewhere; re-flags a clock anomaly). Pure
    orchestration over the injected repository + `Clock`.
  - Barrel now exports `sessionMath` + the whole `state/` layer (still Node-safe).
    Extended the smoke test with 8 checks (W1–W8) covering the math, selectors,
    pure store transitions, restart recovery, and clock-anomaly detection → suite
    now **87/87**.

## Current task

05. Implement the Feed flow (breast + bottle) on the task-04 foundation. Bottle is
an instant quantity event (volume presets + ±10 stepper + milk type; no save when
amount ≤ 0 via `validateBottleAmount`; remember last milk type — plan Phase 3).
Breast is an active session (choose start side → side segments → switch side →
finish) built on the session model: `activeBreastFeed`, `breastSegmentTotals`,
`useElapsedTime`, and side-switch that closes the open segment and opens the new
one (plan Phase 5). This is the first task to add UI + application use-cases
(`startBreastFeed`/`switchBreastSide`/`finishBreastFeed`/`saveBottleFeed`) and to
begin wiring the new domain behind the `loggingV2` flag (a `LoggingProvider` that
calls `hydrateLoggingState` on mount and `subscribeForeground` →
`reconcileLoggingState`).

> Ordering note: the status queue lists Feed (05) before Diaper (07), whereas the
> plan's §16 vertical slice suggests Diaper-first. The queue governs autopilot
> order, so the next run does Feed; the session model is ready either way. Revisit
> if a human prefers the plan's order.

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
- **Task 02 was kept to the pure domain model only** (types + clock + ids +
  validators + errors). The `loggingV2` flag and the repository were deliberately
  deferred to task 03 so each run stays one logical unit; the new module is not
  imported by the app yet, so the running MVP is untouched.
- Validators **return** `ValidationResult` rather than throwing, so the
  application/store layer can surface a recover/error state (plan §6) instead of
  crashing on bad input.
- Added small sanity caps (`BOTTLE_MAX_ML = 4000`, `PUMP_MAX_ML = 2000`) as
  garbage filters, not product limits, alongside the plan's explicit "> 0" rules.
- **Task 03 stores v2 events under their OWN key** (`lullaby/logging-v2/v1`)
  through an injectable `LoggingPersistencePort`, NOT inside the legacy
  `lullaby/local-events/v1` store. Writing `CareEvent`s into the legacy store
  would break its strict `LogEvent` validation and is the destructive move the
  plan forbids until migration is verified (§2.4). "Connect the existing local
  storage/API" is satisfied by (a) reusing the same AsyncStorage mechanism with
  the same defensive load/validate/silent-fail discipline as `localStorage.ts`,
  and (b) the `LegacyLoggingMapper` adapting existing `LogEvent` data into
  `CareEvent` so the v2 timeline can read old rows.
- **Did NOT wire the v2 repository into the live Supabase path.** That needs the
  `version`/`clientEventId`/`subjectUserId` columns and conflict handling the plan
  defers to PR 9; doing it now would risk the running MVP. The repository hides
  storage behind the port so the Supabase backing can be added later without
  changing the contract.
- **The repository owns data-layer concerns:** idempotent create by
  `clientEventId` (retry-safe, plan §9), `version` bump + `updatedAt` stamp on
  update/soft-delete (via the injected `Clock`), and soft-delete instead of hard
  remove (plan §8). Business validators/use-cases stay in the application layer.
- **`familyId` mirrors the baby scope** in the mapper for now (audit §13 open
  question) via an overridable `resolveFamilyId` hook.
- **The barrel (`index.ts`) stays Node-runnable:** it re-exports the RN-free data
  layer + flag but NOT `loggingStorage.ts` (AsyncStorage). Device callers import
  that file directly, mirroring how `localRepository` imports `localStorage`.
- **Task 04 added the state + timer SUBSTRATE but wired nothing into the app.**
  The React provider, the live `AppState` foreground subscription, and the
  start/finish/cancel use-cases land with the flows (05+). This task delivers the
  pure, testable layer they sit on (state shape + transitions, selectors,
  hydration/reconcile orchestration, timestamp math) — all covered by the Node
  smoke test with an in-memory repo + fake clock, so the running MVP is untouched.
- **No persisted counter; durations always derive from timestamps.** `sessionMath`
  recomputes `now − startedAt`; `useElapsedTime` derives the value during render
  and uses the interval only to force a redraw — so there is no setState-in-effect
  (satisfies `react-hooks/set-state-in-effect`) and no stale counter to drift.
- **`useElapsedTime` (React) and `appStateReconcile` (RN `AppState`) are kept OUT
  of the barrel** and imported directly by the UI, mirroring the `loggingStorage`
  precedent, so the barrel stays Node-runnable. `sessionMath` + the `state/` layer
  are pure and ARE exported from the barrel.
- **A backwards clock is surfaced, not hidden:** an active session whose
  `startedAt` is after `now` stays in place (it is real, stored data) but the
  store sets `error: started_in_future` so the UI can show a recover prompt (plan
  §6), while `elapsedMs` clamps the displayed duration to 0.

## Known issues (found during audit, to fix in later tasks)

- **Sleep finish is hardcoded to +72 min** (`SLEEP_FINALIZE_MIN` /
  `endRunningSleep`, `src/data/mock.ts:214,354`) instead of `endedAt = now`.
  Highest-priority behavioral fix for the Sleep flow (task 06).
- No independent sessions IN THE LIVE APP: the running MVP still uses the single
  `orbView`. The new `loggingStore` models concurrent `activeSleep`/
  `activeBreastFeed`/`activePump` (task 04), but it is not wired in until the
  flows + provider land (05+).
- `useElapsedTime`, `sessionMath`, and the `reconcileLoggingState` logic now exist
  (task 04), plus a `subscribeForeground` seam over `AppState`. What remains is the
  live wiring: a provider that runs `hydrateLoggingState` on mount and calls
  `subscribeForeground` → `reconcileLoggingState` on foreground (lands with 05+).
- Diaper has no `dry`; quick-log is 3 taps, not 2. Pump drops `both` and captures
  no volume. Bottle captures no volume/milk type. Breast has no real timers or
  side segments.
- Undo is delete-newest only (no `UndoableMutation` snapshot / undo-finish).

## Last verification

- 2026-06-21 (task 04) — `npx tsc --noEmit` → exit 0. `npm run
  check:local-interactions` → **all 87 checks pass** (79 prior + 8 new, W1–W8,
  for `sessionMath` / session selectors / pure store transitions / hydration /
  foreground reconcile incl. restart recovery and clock-anomaly detection).
  `npm run lint` (`expo lint`) → exit 0, clean. `npm test` still not available (no
  runner; the extended smoke test is the substitute). The new state + timer layer
  is additive and unreferenced by the app (barrel stays Node-safe; the React hook
  + RN `AppState` seam are imported directly, not via the barrel), so MVP behavior
  is unchanged.
- 2026-06-21 (task 03) — `npx tsc --noEmit` → exit 0. `npm run
  check:local-interactions` → **all 79 checks pass** (70 prior + 9 new, V1–V9,
  for the repository/mapper/persistence/flag). `npm run lint` (`expo lint`) →
  exit 0, clean. `npm test` still not available (no runner; the extended smoke
  test is the substitute). The new data layer is additive and unreferenced by the
  app (barrel stays Node-safe; device storage imported directly), so MVP behavior
  is unchanged.
- 2026-06-21 (task 02) — `npx tsc --noEmit` → exit 0 (no `typecheck` script;
  `tsc` used directly). `npm run check:local-interactions` → **all 70 checks
  pass** (60 legacy + 10 new for the logging v2 foundation). `npm run lint`
  (`expo lint`) → clean. `npm test` still not available (no runner; the smoke
  test is the substitute and was extended for the new code). The new module is
  additive and unreferenced by the app, so MVP behavior is unchanged.

## Final result

Not finished.