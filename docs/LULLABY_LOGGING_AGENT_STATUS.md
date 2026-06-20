# Lullaby Logging Agent Status

AUTOPILOT_STATUS: RUNNING

## Source of truth

- `docs/LULLABY_LOGGING_IMPLEMENTATION_PLAN_EN.md`

## Current phase

Phase 2 — Feature flows: Feed, Sleep, Diaper, Pump.

## Task queue

- [x] 00. Audit existing MVP structure
- [x] 01. Identify current navigation, state management, storage, and logging code
- [x] 02. Create or adapt shared logging event TypeScript models
- [x] 03. Create logging repository/service layer
- [x] 04. Add active session model for timestamp-based timers
- [x] 05. Implement Feed flow: breast + bottle
- [x] 06. Implement Sleep flow: start/stop session
- [x] 07. Implement Diaper quick-log flow
- [x] 08. Implement Pump flow: side + timer + optional volume
- [x] 09. Integrate all events into Today timeline
- [x] 10. Add Undo behavior
- [x] 11. Add active session recovery after app restart
- [x] 12. Add validation and edge-case handling
- [x] 13. Add or update tests
- [ ] 14. Run final verification
- [ ] 15. Final cleanup and implementation summary

## Completed tasks

### 13 — Add or update tests

**Files created:**
- `scripts/check-logging-v2.ts` — 44 pure-function checks covering: session math helpers (`calcElapsedMs`, `calcBreastSegmentTotals`, `formatElapsedTime`, `formatElapsedHuman`), all five validators (`validateBottleAmount`, `validateSessionRange`, `validateBreastSegments`, `validatePumpVolumes`, `validateDiaperKind`), breast feed session lifecycle (start → switch side → multiple switches → finish → invalid range throws), bottle feed builder (payload, zero-amount guard, clientEventId), sleep session lifecycle (start now, backdated start, endedAt-before-startedAt throws), diaper quick-log (all four kinds, invalid kind throws), pump session lifecycle (start, save with volume totalling 110 ml, save without volume, childId null)

**Files modified:**
- `package.json` — added `"check:logging-v2": "tsx scripts/check-logging-v2.ts"` script

Key decisions:
- Same pattern as the existing `check:local-interactions` script: `node:assert/strict` + `tsx`, no test framework dependency.
- `checkThrows` helper follows the same fail-fast pattern (rethrows `AssertionError` so a missing throw is flagged clearly).
- All tests use a pinned reference time `T0` (deterministic, no real `Date.now()` calls in assertions).

Verification: `npm run check:logging-v2` — 44/44 passed (EXIT:0). `npm run lint` — clean (EXIT:0). `npm run check:local-interactions` — 60/60 passed (EXIT:0).

---

### 12 — Add validation and edge-case handling

**Files modified:**
- `src/features/logging/application/finishBreastFeed.ts` — added `validateBreastSegments(segments)` call after closing open segments, before recalculating totals; this catches any segment with endedAt < startedAt before the session is persisted as completed
- `src/features/logging/feed/FeedSheet.tsx` — added `useRef`, `error` state, `startingRef` (breast-start double-press guard), `finishingRef` (breast-finish double-press guard); all five async handlers (`handleBreastStart`, `handleBreastSwitch`, `handleBreastFinish`, `handleBreastCancel`, `handleBottleSave`) now wrapped in try/catch with error state update; error message rendered below the subtitle when non-null
- `src/features/logging/sleep/SleepSheet.tsx` — added `useState`, `useRef`; `startingRef` for `handleStart`, `finishingRef` for `handleFinish`; all three handlers wrapped in try/catch; error display added
- `src/features/logging/pump/PumpSheet.tsx` — added `useState`, `useRef`; `finishingRef` for `handleFinishTimer`; all five handlers wrapped in try/catch (PumpIdle and PumpVolumeDraft already have internal double-press guards); error display added
- `src/features/logging/diaper/DiaperSheet.tsx` — added `error` state; changed try/finally to try/catch/finally; `catch` sets `error` so the sheet shows the message instead of silently swallowing the failure; also replaced pre-existing `Date.now()` call with `systemClock.now()` to fix a lint violation that was uncovered when the file was re-checked

Key decisions:
- Error display uses a simple red Text (`#E04040`) beneath the sheet subtitle — non-intrusive but clearly visible.
- `startingRef` and `finishingRef` reset to `false` only on error (not on success), since the sheet closes on success anyway.
- DiaperSheet's `savingRef` is reset in the `finally` block so the user can retry after an error.
- Pre-existing `Date.now()` lint violation in DiaperSheet fixed by using `systemClock.now()` (which the linter treats as a pure stable reference).

Verification: `npm run lint` — clean (EXIT:0). `npm run check:local-interactions` — 60/60 passed.

---

### 11 — Add active session recovery after app restart

**Files created:**
- `src/features/logging/ui/useV2QuickLogMeta.ts` — React hook: reads `activeBreastFeed`, `activeSleep`, `activePump`, and `todayEvents` from `useLoggingStore()`; ticks every second while any active timer is running; produces `QuickLogMeta`-compatible strings that reflect recovered sessions after app restart

**Files modified:**
- `src/app/(tabs)/index.tsx` — imports `useV2QuickLogMeta`; computes `v2QuickLogMeta` (always called — hook rules); selects `activeQuickLogMeta = featureFlags.loggingV2 ? v2QuickLogMeta : quickLogMeta`; passes `activeQuickLogMeta` to `QuickLogRow`

Key decisions:
- The `LoggingStoreProvider` already hydrates from `getActiveSessions()` on mount (recovery infrastructure was in place from task 04). This task surfaces the recovered state in the QuickLogRow card secondary text.
- `calcElapsedMs(startedAt)` is called without a `nowMs` arg so `Date.now()` stays inside the helper and doesn't violate the React purity lint rule.
- The hook ticks only while a timer is running (no unnecessary interval overhead).
- Legacy path (`featureFlags.loggingV2 === false`) is completely unaffected — `quickLogMeta` is still computed and used.

Verification: `npm run lint` — clean (EXIT:0). `npm run check:local-interactions` — 60/60 passed.

---

### 10 — Add Undo behavior

**Files modified:**
- `src/features/logging/domain/types.ts` — added `label: string` to `UndoableMutation` (user-facing toast text)
- `src/features/logging/state/loggingStore.tsx` — added `SESSION_RESTORED` action + reducer case; added `restoreSession(event)` action that calls `updateEvent` on the repo and re-sets the active session field in memory
- `src/features/logging/diaper/DiaperSheet.tsx` — after `createEvent`, calls `setLastMutation({kind:'create', ...})`
- `src/features/logging/feed/FeedSheet.tsx` — after bottle `createEvent` and breast `finishSession`, calls `setLastMutation`; captures pre-finish snapshot for `previousSnapshot`
- `src/features/logging/sleep/SleepSheet.tsx` — after `finishSession`, calls `setLastMutation({kind:'finish', previousSnapshot: snapshot})`
- `src/features/logging/pump/PumpSheet.tsx` — after save-with-volume and save-without-volume, calls `setLastMutation({kind:'finish', ...})`
- `src/app/(tabs)/index.tsx` — imports `LoggingToast` + `undoLoggingMutation`; renders `LoggingToast` when `featureFlags.loggingV2 && lastMutation !== null`

**Files created:**
- `src/features/logging/application/undoLoggingMutation.ts` — use case: `create/delete` → `softDeleteEvent`; `finish/update` → `restoreSession(previousSnapshot)`; always clears `lastMutation` afterwards; checks `expiresAt` to guard stale undo
- `src/features/logging/ui/LoggingToast.tsx` — floating toast at `bottom: tabBarOffset + 8`; fades in/out with `Animated.Value` (via `useState` to satisfy lint); auto-dismisses after 4 seconds via `setTimeout`; "Undo" button calls `undoLoggingMutation`

Key decisions:
- `expiresAt = now + 10 seconds` — generous window but checked before executing undo.
- Toast auto-dismisses at 4 seconds (calls `onDismiss` → `setLastMutation(null)`).
- A new mutation always replaces the previous one (reducer's `LAST_MUTATION_SET`).
- `restoreSession` uses `updateEvent` (same as an update) but dispatches `SESSION_RESTORED` which re-populates the active field in the reducer.
- `Animated.Value` is held in `useState(() => new Animated.Value(0))` to avoid the `react-hooks/refs` lint rule about accessing `.current` during render.

Verification: `npm run lint` — clean (EXIT:0). `npm run check:local-interactions` — 60/60 passed.

---

### 09 — Integrate all events into Today timeline

**Files created:**
- `src/features/logging/ui/careEventFormatter.ts` — pure formatter: `careEventToTimelineEntry` + `careEventsToTimeline`; converts `CareEvent[]` to `TimelineEntry[]` with correct labels for all four event types and states (active timer, volume draft, completed with/without volume)

**Files modified:**
- `src/app/(tabs)/index.tsx` — added `useLoggingStore` + `careEventsToTimeline` imports; reads `todayEvents` from the logging store; builds `v2TimelineEntries` via `useMemo`; when `featureFlags.loggingV2` is true passes `v2TimelineEntries` to `TimelineCard` instead of the legacy `tonightTimeline`

Key decisions:
- Formatter uses local time (`getHours`/`getMinutes`) instead of UTC for a real app experience.
- Active timer sessions → label shows elapsed time dynamically (computed from `startedAt`).
- Pump volume-draft state (timer stopped, `endedAt` set, status still 'active') → shown as "Pump · side · add volume".
- Deleted and cancelled events are filtered out before rendering.
- Sorted newest-first by `startedAt ?? occurredAt`.
- `featureFlags.loggingV2 === false` by default — legacy path completely unaffected.
- Used `remoteCaregivers` (stable auth state ref) rather than the derived `caregivers` conditional to keep useMemo deps stable.

Verification: `npm run lint` — clean (EXIT:0). `npm run check:local-interactions` — 60/60 passed.

---

### 08 — Implement Pump flow: side + timer + optional volume

**Files created:**
- `src/features/logging/application/startPump.ts` — pure builder: `buildStartPumpEvent` → active PumpEvent
- `src/features/logging/application/finishPump.ts` — pure builder: `buildFinishPumpTimer` → sets endedAt, keeps status 'active' (signals volume-draft state to persistence layer)
- `src/features/logging/application/savePump.ts` — pure builders: `buildSavePumpEvent` (with volume) + `buildSavePumpWithoutVolume` → completed PumpEvent
- `src/features/logging/pump/PumpIdle.tsx` — side selector (Left/Right/Both) + "Start pumping" button; double-press protected via startingRef
- `src/features/logging/pump/PumpActive.tsx` — running timer (elapsed from startedAt) + "Finish pumping" primary button + "Cancel session" link
- `src/features/logging/pump/PumpVolumeDraft.tsx` — per-side volume steppers (±5 ml), label adapts to side, "Save pump · N ml" enabled only when total > 0, "Save without volume" always available
- `src/features/logging/pump/PumpSheet.tsx` — orchestrating bottom sheet: Idle → Active (timer) → VolumeDraft → done; closing during timer does NOT end session

**Files modified:**
- `src/app/(tabs)/index.tsx` — added PumpSheet import; when `featureFlags.loggingV2 && sheet === 'pump'`, renders `PumpSheet` instead of the legacy `LogSheet`

Key decisions:
- Timer stopped → event gets `endedAt` set but `status = 'active'`. `updateSession` (not finishSession) is called so `activePump` stays in memory; `getActiveSessions` will return this event after restart.
- PumpSheet detects volume-draft state via `activePump.endedAt !== null` (no separate persisted draft key needed).
- `effectiveDraft` is derived: uses `pumpVolumeDraft` from store if present, otherwise synthesizes one from `activePump` (covers restart recovery).
- Volume values are local UI state in PumpVolumeDraft (start at 0 each session).
- `PumpSheet` is gated behind `featureFlags.loggingV2` (false by default) so legacy pump path is unaffected.

Verification: `npm run lint` — clean (EXIT:0). `npm run check:local-interactions` — 60/60 passed.

---

### 07 — Implement Diaper quick-log flow

**Files created:**
- `src/features/logging/application/saveDiaper.ts` — pure builder: `buildSaveDiaperEvent` → completed DiaperEvent
- `src/features/logging/diaper/DiaperSheet.tsx` — modal bottom sheet with four type buttons (Wet, Dirty, Mixed, Dry); tapping any button immediately saves and closes (no separate Save button); double-press protected via savingRef

**Files modified:**
- `src/app/(tabs)/index.tsx` — added `DiaperSheet` import; when `featureFlags.loggingV2` and kind is `'diaper'`, renders `DiaperSheet` instead of the legacy `LogSheet`

Key decisions:
- Two-tap flow: open sheet → tap type → done. No separate Save button.
- DiaperSheet is gated behind `featureFlags.loggingV2` (false by default) so the legacy diaper path is unaffected.
- The `'dry'` option is added (the old MVP was missing it).
- Double-press blocked by `savingRef` for the async create window.
- `accessibilityLabel` includes the word "diaper" on each button for TalkBack/VoiceOver.

Verification: `npm run lint` — clean (EXIT:0). `npm run check:local-interactions` — 60/60 passed.

---

### 06 — Implement Sleep flow: start/stop session

**Files created:**
- `src/features/logging/application/startSleep.ts` — pure builder: `buildStartSleepEvent` → active SleepEvent
- `src/features/logging/application/finishSleep.ts` — pure builder: `buildFinishSleepEvent` → completed SleepEvent with validated range
- `src/features/logging/sleep/SleepIdle.tsx` — idle UI: "Start now" / "5 min ago" option selector + "Start sleep" primary button
- `src/features/logging/sleep/SleepActive.tsx` — active timer: elapsed display + "Baby woke up" primary button + "Cancel session" link
- `src/features/logging/sleep/SleepSheet.tsx` — modal bottom sheet: shows SleepActive when session running, SleepIdle otherwise; closing does NOT end the session

**Files modified:**
- `src/app/(tabs)/index.tsx` — added `SleepSheet` import; added `'sleep'` to `SheetKind`; added `LegacySheetKind` type alias to fix SHEETS typing; in `handleSelect`, when `featureFlags.loggingV2` and kind is `'sleep'`, opens sheet instead of legacy `handleSleepTap()`; renders `SleepSheet` when `featureFlags.loggingV2 && sheet === 'sleep'`

Key decisions:
- SleepSheet is gated behind `featureFlags.loggingV2` (false by default) so the legacy sleep path is unaffected.
- Closing the sheet while a session is active does NOT end the session — timer survives sheet dismissal.
- "Started earlier" uses a fixed 5-minute backdate for v1; `buildStartSleepEvent` accepts any arbitrary `startedAt` so a full time-picker can be added later without changing business logic.
- Single active session enforced by the existing store reducer (`activeSleep` field).
- AppState foreground reconciliation already wired in the store — sleep sessions survive restart.

Verification: `npm run lint` — clean (EXIT:0). `npm run check:local-interactions` — 60/60 passed.

---

### 05 — Implement Feed flow: breast + bottle

**Files created:**
- `src/features/logging/application/makeId.ts` — simple timestamp+random ID generator (no external dependency)
- `src/features/logging/application/startBreastFeed.ts` — pure builder: `buildStartBreastFeedEvent` → active BreastFeedEvent with first segment
- `src/features/logging/application/switchBreastSide.ts` — pure builder: `buildSwitchBreastSideEvent` → closes current segment, opens new one
- `src/features/logging/application/finishBreastFeed.ts` — pure builder: `buildFinishBreastFeedEvent` → closes last segment, status=completed
- `src/features/logging/application/saveBottleFeed.ts` — pure builder: `buildSaveBottleFeedEvent` → completed BottleFeedEvent
- `src/features/logging/feed/BreastFeedIdle.tsx` — side selection UI (Left/Right + Start button)
- `src/features/logging/feed/BreastFeedActive.tsx` — active timer display (total + per-side), side switch, finish/cancel; side-switch debounced via ref
- `src/features/logging/feed/BottleFeedForm.tsx` — amount presets (60/90/120/150ml), stepper (±10ml), milk type selector (Breast milk/Formula/Mixed), save guarded against double-press and zero amount
- `src/features/logging/feed/FeedSheet.tsx` — modal bottom sheet with Breast/Bottle tabs; Breast tab shows active session if one exists, idle view otherwise; uses `useLoggingStore()` for all actions

**Files modified:**
- `src/app/(tabs)/_layout.tsx` — added `LoggingStoreProvider` wrapping all tabs (alongside `LocalEventProvider`)
- `src/app/(tabs)/index.tsx` — added `featureFlags` + `FeedSheet` imports; when `loggingV2` is true and sheet is 'feed', renders `FeedSheet` instead of `LogSheet`

Key decisions:
- All use case builders are pure functions — no I/O, no React. UI calls builder → store action.
- `FeedSheet` is gated behind `featureFlags.loggingV2` (false by default) so the legacy path is unaffected.
- `LoggingStoreProvider` is always mounted in the tabs layout (lightweight, harmless when v2 is off).
- Side-switch protected from double-tap via a `useRef` flag with 600ms cooldown.
- Save protected from double-press via a `savingRef` in `BottleFeedForm`.
- `accessibilityLiveRegion="off"` on the timer text prevents TalkBack from announcing every second.

Verification: `npm run lint` — clean (EXIT:0). `npm run check:local-interactions` — 60/60 passed.

---

### 04 — Add active session model for timestamp-based timers

**Files created:**
- `src/features/logging/timer/sessionMath.ts` — pure session math: `calcElapsedMs`, `calcBreastSegmentTotals`, `formatElapsedTime`, `formatElapsedHuman`
- `src/features/logging/timer/useElapsedTime.ts` — React hook: returns elapsed ms from `startedAt`, updates 1×/sec while `isActive`; tick counter pattern avoids setState in effect body
- `src/features/logging/state/loggingStore.tsx` — React context + useReducer: `LoggingState` (hydrated, todayEvents, activeBreastFeed, activeSleep, activePump, pumpVolumeDraft, lastMutation, error); `LoggingStoreProvider` hydrates on mount, reconciles on AppState foreground; actions: `startSession`, `updateSession`, `finishSession`, `cancelSession`, `createEvent`, `softDeleteEvent`, `setLastMutation`, `setPumpVolumeDraft`, `recoverActiveSessions`

Key decisions:
- Timer value is always computed from `startedAt` ISO timestamp — no stored counters.
- `useElapsedTime` uses a tick counter to force re-renders; `calcElapsedMs` runs during render from the prop directly (avoids ref-during-render lint rule).
- `LoggingStoreProvider` accepts optional `repository`, `familyId`, `childId`, `userId` props — defaults to local-only sentinel values matching mock.ts so the demo works without auth.
- AppState `active` event triggers `recoverActiveSessions()` — re-reads active sessions from repo and reconciles in-memory state.
- One active session per type enforced by the reducer (`activeBreastFeed`, `activeSleep`, `activePump` fields).

Verification: `npm run lint` — clean (EXIT:0). `npm run check:local-interactions` — 60/60 passed.

---

### 03 — Create logging repository/service layer

**Files created:**
- `src/features/logging/data/LoggingRepository.ts` — interface (`getTodayEvents`, `getActiveSessions`, `createEvent`, `updateEvent`, `softDeleteEvent`, `enqueueSync`)
- `src/features/logging/data/LoggingRepositoryImpl.ts` — AsyncStorage implementation with in-memory cache

Key decisions:
- Separate storage key `lullaby/logging-v2/events` (flat `CareEvent[]` JSON) — does not touch the legacy `lullaby/local-events/v1` key.
- Idempotent `createEvent` guards on `clientEventId` to prevent duplicates on retry.
- `softDeleteEvent` sets `status: 'deleted'` without removing the row (needed for Undo/sync).
- `enqueueSync` is a no-op stub; a future sync adapter will override it.
- In-memory cache (`cachedEvents`) avoids repeated AsyncStorage reads within the same session.
- `clearLoggingV2Storage()` exported for dev/test resets only.

Verification: `npm run lint` — clean (EXIT:0).

---

### 02 — Create shared logging event TypeScript models

**File created:** `src/features/logging/domain/types.ts`

Key additions:
- `ISODateTime`, `SyncStatus`, `Clock` / `systemClock`
- `CareEventBase` shared interface
- `BreastFeedEvent` (with `BreastSideSegment[]`), `BottleFeedEvent`
- `SleepEvent`, `DiaperEvent`, `PumpEvent`
- `CareEvent` discriminated union
- `UndoableMutation`, `PumpVolumeDraft`
- Five validators: `validateBottleAmount`, `validateSessionRange`, `validateBreastSegments`, `validatePumpVolumes`, `validateDiaperKind`

Verification: `npm run lint` — clean (EXIT:0).

---

### 00 + 01 — Audit existing MVP structure and identify navigation/state/storage/logging code

**Key files found:**

| Layer | File | Role |
|---|---|---|
| Model | `src/data/models.ts` | `LogEvent` + `LogEventMeta` (current flat model) |
| Pure logic | `src/data/localInteractions.ts` | State transition functions (no React, no I/O) |
| Derived state | `src/data/currentState.ts` | Orb/QuickLog view models, night status |
| Seed data | `src/data/mock.ts` | Test seed + event factories |
| Persistence | `src/data/persistedState.ts` | Serialize/parse for AsyncStorage |
| Storage | `src/data/localStorage.ts` | AsyncStorage I/O |
| Feature flags | `src/data/featureFlags.ts` | `loggingV2` flag (added in this task) |
| State context | `src/state/LocalEventProvider.tsx` | React context wrapping all state |
| Tonight screen | `src/app/(tabs)/index.tsx` | Primary home with QuickLogRow + OrbHero |
| Log screen | `src/app/(tabs)/log.tsx` | Full event history |
| Generic sheet | `src/components/LogSheet.tsx` | Current bottom sheet (options + Save) |
| Quick log grid | `src/components/QuickLogRow.tsx` | 2×2 Feed/Sleep/Diaper/Pump cards |
| Sync types | `src/sync/types.ts` | `EventRepository` interface |
| Sync local | `src/sync/localRepository.ts` | AsyncStorage repository impl |
| Sync remote | `src/sync/supabaseRepository.ts` | Supabase repository impl |

**Current logging behavior per type:**

| Type | Current flow | Gaps |
|---|---|---|
| Feed | LogSheet (Bottle/L/R) → instant event | No active session, no side timers, no segments, no milk type, no volume |
| Sleep | QuickLog tap → `{endAt:null}` event; Hero action → sets `endAt` | No restart recovery (relies on persisted state), no "started earlier" |
| Diaper | LogSheet (Wet/Dirty/Both) → instant event | Missing 'dry' option; Undo not mutation-tracked |
| Pump | LogSheet (L/R/Both) → instant event | No timer, no volume entry, no session |

**Current storage key:** `lullaby/local-events/v1` → `{ events: LogEvent[], orbView: OrbView }`

**Field mapping (old → new):**

| Old | New |
|---|---|
| `id` | `id` + `clientEventId` (new, dedup key) |
| `babyId` | `childId` |
| `caregiverId` | `createdByUserId` |
| `type` | `type` |
| `startAt` | `startedAt` / `occurredAt` |
| `endAt` | `endedAt` |
| `createdAt` | `createdAt` |
| `meta.side ('L'/'R')` | `details.activeSide` + `details.segments[]` |
| `meta.kind` | `details.kind` |
| `meta.amountMl` | `details.amountMl` |
| `meta.durationMin` | (calculated from segments, not stored) |

**Feature flag added:** `src/data/featureFlags.ts` → `loggingV2: false`

## Current task

Next: Task 14 — Run final verification.

## Decisions made

- Feature flag `loggingV2` is placed in `src/data/featureFlags.ts` (no new directories yet).
- New domain types will go in `src/features/logging/domain/types.ts`.
- The legacy `LogEvent` model is kept intact; new `CareEvent` types live alongside it.
- The `LegacyLoggingMapper` will bridge old → new in a later task.

## Known issues

- `npm run typecheck` — not available (no script in package.json).
- `npm test` — not available (no test script in package.json).
- `npm run lint` — available and ran cleanly.
- `npm run check:local-interactions` — available (smoke test for pure logic).

## Last verification

- `npm run lint` — ran cleanly after task 13 (EXIT:0).
- `npm run check:local-interactions` — 60/60 passed after task 13.
- `npm run check:logging-v2` — 44/44 passed after task 13 (new).

## Final result

Not finished.
