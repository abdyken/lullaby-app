# Lullaby Logging Agent Status

AUTOPILOT_STATUS: RUNNING

## Source of truth

- `docs/LULLABY_LOGGING_IMPLEMENTATION_PLAN_EN.md`

## Current phase

Phase 1 — Foundation: domain types and repository.

## Task queue

- [x] 00. Audit existing MVP structure
- [x] 01. Identify current navigation, state management, storage, and logging code
- [x] 02. Create or adapt shared logging event TypeScript models
- [x] 03. Create logging repository/service layer
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

Next: Task 04 — Add active session model for timestamp-based timers.

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

- `npm run lint` — ran cleanly after task 03 (EXIT:0).

## Final result

Not finished.
