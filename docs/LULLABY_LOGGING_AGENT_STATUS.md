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

Next: Task 07 — Implement Diaper quick-log flow.

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

- `npm run lint` — ran cleanly after task 06 (EXIT:0).
- `npm run check:local-interactions` — 60/60 passed after task 06.

## Final result

Not finished.
