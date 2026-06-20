# Lullaby Logging Agent Status

AUTOPILOT_STATUS: RUNNING

## Source of truth

- `docs/LULLABY_LOGGING_IMPLEMENTATION_PLAN_EN.md`
- `docs/LULLABY_LOGGING_MVP_AUDIT.md` (Phase 0 audit output — read before refactoring)

## Current phase

Phase 7 (Pump) — done. Pump now runs end-to-end behind the `loggingV2` flag and is
the **fourth and last** of the core flows. Pump belongs to the caregiver
(`subjectUserId = caregiver`, `childId` kept as an optional family association so it
still shows in the family timeline — plan §4.4). It is the only flow with a
post-finish **volume draft**: four pure use-cases over `{ repo, clock, actor }` —
`startPump` (active `PumpEvent` with side left/right/both; reopens the existing
session instead of creating a second — one active pump per caregiver, plan Phase 4),
`finishPump` (sets `endedAt` but keeps `status = 'active'`, so the finished session
stays in `getActiveSessions` and the store turns it into a `pumpVolumeDraft` — that
is what makes the draft survive sheet-close + restart for free, plan Phase 7.2),
`savePump` (writes `leftVolumeMl`/`rightVolumeMl`, `status = completed`; "save without
volume" is the same use-case with null volumes — the only way zero is allowed), and
`cancelPump`. The total is derived by the `pumpTotalVolumeMl` selector, never stored
(plan §7.3). The provider exposes `activePump`/`pumpVolumeDraft` + `startPump`/
`finishPump`/`savePump`/`cancelPump` (same validate-then-write / refresh-on-success /
error pattern + mutation lock as Sleep). The Pump UI (`PumpSheet` + `PumpIdle` side
chooser + `PumpActive` timer + `PumpVolumeDraft` stepper) reuses `ChoicePill` /
`PrimaryActionButton`. Wired into `(tabs)/index.tsx`: with the flag on the Pump card
opens `PumpSheet`; with it off the legacy `LogSheet` pump path is byte-for-byte
unchanged. Undo + the toast land with the shared Undo in **task 10**. Next:
status task 09 "Integrate all events into Today timeline".

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
- **05 — Feed flow: breast + bottle (Phase 3 + Phase 5, first live flow).** The
  first task to add the application layer, a React provider, and UI, all behind
  the `loggingV2` flag (MVP untouched while off):
  - `application/` — pure async use-cases over `{ repo, clock, actor }` returning
    a `UseCaseResult` (never throwing): `saveBottleFeed` (validates amount, instant
    completed event, idempotent by `clientEventId`), `startBreastFeed` (active
    session + first open segment; reopens the existing session instead of creating
    a second — plan Phase 4), `switchBreastSide` (closes the open segment / opens
    the other side / recomputes totals from segments; same-side tap is a no-op),
    `finishBreastFeed` (closes last segment, totals from segments, → completed),
    `cancelBreastFeed` (→ cancelled, never a logged feed). Plus `newCareEventBase`
    + `LoggingActor`/`LoggingUseCaseDeps` in `application/types.ts`. Exported from
    the barrel (Node-safe — no React/AsyncStorage).
  - `state/LoggingProvider.tsx` — the React seam: owns a device repository + system
    clock, holds `LoggingState`, runs `hydrateLoggingState` on mount and
    `subscribeForeground` → `reconcileLoggingState` on foreground, and exposes the
    Feed actions (with a mutation lock for double-tap safety). GATED on the flag:
    no I/O at all while `loggingV2` is off. Derives the actor from `useAuth`
    (Supabase) or the seed baby/caregiver (local-only). NOT in the barrel (React +
    AsyncStorage); mounted in `(tabs)/_layout.tsx` inside `LocalEventProvider`.
  - `feed/` UI — `FeedSheet` (Modal shell + Breast/Bottle tabs; opens straight into
    the active view when a session is running), `BreastFeedIdle` (side + start),
    `BreastFeedActive` (live total + per-side via `useElapsedTime`/
    `breastSegmentTotals`, switch, Finish, separated Cancel), `BottleFeedForm`
    (presets + ±10 stepper + milk type, no keyboard, Save disabled at 0), and a
    shared `ChoicePill` (inner-View surface for reliable Android paint).
  - Wired into `(tabs)/index.tsx`: with the flag on, the Feed quick-log tap opens
    `FeedSheet`; with it off, the legacy `LogSheet` path is unchanged.
  - Extended the smoke test with 10 checks (X1–X10) for the Feed use-cases
    (bottle save/validation/idempotency; breast start/switch/finish totals, the
    canonical 5m/3m and multi-switch cases, resume-existing, hydration restore,
    same-side no-op, cancel) → suite now **97/97**.
- **06 — Sleep flow: start/stop active session (Phase 6, second live flow + the
  legacy finish-time bug fix).** Built on the now-live session engine + provider:
  - `application/` — four pure use-cases over `{ repo, clock, actor }`:
    `startSleep` (active `SleepEvent`, `startedAt = now` or a backdated/"started
    earlier" timestamp validated not-future; reopens the existing session instead
    of creating a second — one active sleep per child, plan Phase 4/6.1),
    `finishSleep` (`endedAt = now`, `status = completed`, range-validated so a
    backwards clock surfaces an error not a bad record), `cancelSleep`
    (→ cancelled, never a logged sleep), and `saveCompletedSleep` (the Phase 6.4
    manual path — a completed event from an explicit start/end, never an active
    timer). Exported from the barrel (Node-safe).
  - `state/LoggingProvider.tsx` — added the `activeSleep` slot + `startSleep`/
    `finishSleep`/`cancelSleep`/`saveCompletedSleep` bound actions, same
    validate-then-write / refresh-on-success / error-on-failure pattern and
    mutation lock as the Feed actions.
  - `sleep/` UI — `SleepSheet` (Modal shell + sleep accent; opens straight into
    the active view when a session is running), `SleepIdle` (STARTED presets
    Now / 5m / 15m / 30m ago + "Start sleep", and an "Add a completed sleep"
    expander with 30m / 1h / 2h duration presets), and `SleepActive` (live
    `HH:MM:SS` from `useElapsedTime`, "Started HH:MM", "Baby woke up" finish,
    separated Cancel). Reuses the Feed flow's `ChoicePill` + `PrimaryActionButton`.
  - Wired into `(tabs)/index.tsx`: with the flag on, the Sleep quick-log tap opens
    `SleepSheet`; with it off, the legacy `handleSleepTap` orb path is unchanged.
  - **Fixed the audit's highest-priority bug:** legacy `endRunningSleep`
    (`src/data/mock.ts`) now sets `endAt = now` (clamped ≥ `startAt`) instead of
    `startAt + 72 min`; removed the dead `SLEEP_FINALIZE_MIN` const and threaded
    `now` from `handlePrimaryAction`. Updated the one smoke-test check that encoded
    the bug (N2: 72 → the real 68m / "1h 08m").
  - Extended the smoke test with 8 checks (Y1–Y8): start creates one active sleep;
    start→+40m finish = 40m completed in the timeline; started-5m-earlier→+20m =
    25m; second start resumes (no duplicate); finish with `endedAt < startedAt`
    rejected (nothing persisted); cancel discards; hydration restores after
    restart; `saveCompletedSleep` logs a completed sleep (no timer) and rejects a
    future start → suite now **105/105**.
- **07 — Diaper quick-log flow (plan Phase 2 / §16 vertical slice, third live
  flow; the simplest event, two taps).** The instant-log counterpart to the bottle
  save — no session, no timer:
  - `application/saveDiaper.ts` — a pure use-case over `{ repo, clock, actor }`:
    validates the kind (`validateDiaperKind` → wet / dirty / both / dry, plan §4.3),
    creates a `completed` `DiaperEvent` with `occurredAt = now` and
    `startedAt`/`endedAt = null`, idempotent by `clientEventId` so a fumbled
    double-tap lands a single event. `rash`/`note` stay off the quick-log path.
    Exported from the barrel (Node-safe).
  - `state/LoggingProvider.tsx` — added the `saveDiaper(kind)` bound action, same
    validate-then-write / refresh-on-success / set-error-on-failure pattern and
    shared mutation lock as the bottle save.
  - `diaper/` UI — `DiaperSheet` (Modal shell + diaper accent; title + "saves
    instantly" hint) and `DiaperTypeButton` (one action row per kind: a tap calls
    `saveDiaper(kind)` and closes the sheet on success — no Save button). Distinct
    per-kind glyph (droplet / disc / half-disc / ring) but the bold text label +
    `accessibilityLabel="<Kind> diaper"` carry the meaning (plan Phase 10 — never
    colour-only). Inner-View surface for reliable Android paint, like `ChoicePill`.
  - Wired into `(tabs)/index.tsx`: with the flag on the Diaper card opens
    `DiaperSheet`; with it off the legacy `LogSheet` diaper path is unchanged.
  - Extended the smoke test with 6 checks (Z1–Z6): "wet" → one completed,
    timer-less diaper in the timeline; every kind (incl. **dry**) maps to the exact
    kind; an unknown kind is rejected and persists nothing; a double save with one
    `clientEventId` lands a single event; a diaper is never an active session;
    a logged diaper survives a restart (offline-safe) → suite now **111/111**.
- **08 — Pump flow: side + timer + optional volume (plan Phase 7, the fourth and
  last flow; the most stateful).** Pump belongs to the caregiver, not the child
  (`subjectUserId = caregiver`; `childId` kept as an optional family association so
  it still appears in the family timeline — plan §4.4):
  - `application/` — four pure use-cases over `{ repo, clock, actor }`: `startPump`
    (active `PumpEvent` with `side` left/right/both, validates the side, reopens the
    existing session instead of creating a second — one active pump per caregiver,
    plan Phase 4); `finishPump` (sets `endedAt` but DELIBERATELY keeps `status =
    'active'`, so the finished session stays in `getActiveSessions` — the store then
    surfaces it as a `pumpVolumeDraft`, which is what makes the draft survive
    sheet-close + restart with no extra persistence, plan Phase 7.2); `savePump`
    (writes per-side volumes via `validatePumpVolumes`, `status = completed`;
    "save without volume" is the same use-case with `null` volumes — the only way
    zero is allowed, plan §7.3); `cancelPump` (→ cancelled, never a logged pump).
    Exported from the barrel (Node-safe).
  - `state/loggingSelectors.ts` — `isPumpVolumeDraft` (active pump with `endedAt`
    set), `pumpEventToVolumeDraft` (the self-contained draft view), and
    `pumpTotalVolumeMl` (the derived total — **never stored**, plan §7.3).
  - `state/loggingStore.ts` — `applyActiveSessions` now derives `pumpVolumeDraft`
    from a finished-but-active pump while `activePump` still holds the full record
    (so the provider can complete/cancel it). The draft is therefore re-derived from
    persisted data on every hydrate/reconcile — never lost on close or restart.
  - `state/LoggingProvider.tsx` — added `activePump`/`pumpVolumeDraft` + the
    `startPump`/`finishPump`/`savePump`/`cancelPump` bound actions (same
    validate-then-write / refresh-on-success / set-error-on-failure pattern and
    mutation lock as Sleep).
  - `pump/` UI — `PumpSheet` (Modal shell + pump accent; three bodies that follow
    `idle → running → volumeDraft`, draft taking priority so a finished pump always
    reopens on the volume step), `PumpIdle` (Left/Right/Both chooser + "Start
    pumping"), `PumpActive` (live `useElapsedTime` timer + side + "Finish pumping" +
    separated Cancel), and `PumpVolumeDraft` (per-side ±5 ml steppers shown by side,
    derived total, "Save pump · N ml" disabled at 0 so zero only goes through
    "Save without volume" — a 0 side is sent as `null`, never 0).
  - Wired into `(tabs)/index.tsx`: with the flag on the Pump card opens `PumpSheet`;
    with it off the legacy `LogSheet` pump path is byte-for-byte unchanged.
  - Extended the smoke test with 9 checks (AA1–AA9): start creates one
    caregiver-scoped active pump (no endedAt, null volumes); a second start resumes
    (no duplicate); finish keeps it active with a fixed duration and produces a
    volume draft; Both + 50/60 ml completes with a derived 110 ml total; save without
    volume stores null volumes + duration only; a single-side pump can't record the
    other side (rejected, draft intact); the draft survives a restart; cancel
    discards; a pump and an active sleep coexist → suite now **120/120**.

## Current task

09. Integrate all events into the Today timeline (plan §7.1, §7.4, Phase 6.5,
Phase 8). All four flows now WRITE to the v2 store (`lullaby/logging-v2/v1`) and
appear in `LoggingState.todayEvents`, but the VISIBLE timeline + the quick-log card
subtitles/active-ring still read the legacy `useLocalEvents` store, so v2 events are
persisted but not yet rendered there. Task 09 wires the rendered UI to the v2 store:
a `formatTimelineEvent(event: CareEvent)` formatter (title/subtitle/icon/tint by
type — plan §7.4), the quick-log card subtitle selector (plan §7.1 examples:
`Feeding · 12m · right`, `Sleeping · 42m`, `Pumping · 18m · both`, `Finished · add
volume`, `4h 20m ago · 90 ml`), and the **single source of truth** for Sleep —
unifying the Hero `Start sleep / Baby woke up` + the Quick Log card + the v2 sheet on
one v2 session (plan Phase 6.5; today the Sleep card opens the v2 sheet while the Hero
still drives the legacy orb session). Keep it behind the flag: with `loggingV2` off
the legacy timeline/cards are byte-for-byte unchanged. Undo for v2 mutations is
**task 10**; deeper restart-recovery acceptance is **task 11**.

> Milestone: with Pump (08) done, **all four flows (Feed, Sleep, Diaper, Pump) are
> live behind the `loggingV2` flag** — each an application + UI increment on the
> shared session engine + provider. The session engine handles three concurrent
> kinds (sleep + breast scoped per child, pump per caregiver) and one persistent
> draft (pump volume).
>
> Scope boundary carried forward: all four flows now WRITE to the v2 store
> (`lullaby/logging-v2/v1`) and appear in the v2 `LoggingState.todayEvents`, but the
> VISIBLE timeline + the quick-log card subtitle/active-ring still read the legacy
> `useLocalEvents` store. Wiring the rendered timeline + quick-log cards to the v2
> store is **task 09** (integrate timeline). The **single source of truth** for
> Sleep — unifying the Hero `Start sleep / Baby woke up` + the Quick Log card + the
> sheet on one v2 session (plan Phase 6.5) — also lands in task 09: today the Sleep
> card opens the v2 sheet, while the Hero still drives the legacy orb session, so
> with the flag on the two are not yet the same session. Undo for v2 mutations is
> **task 10**; deeper restart-recovery acceptance is **task 11**.

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
- **Task 05 wired the new domain into the app for the first time, but only behind
  the flag.** `LoggingProvider` is always mounted, yet does ZERO I/O (no hydrate,
  no `AppState` subscription) while `loggingV2` is off, and the only consumer
  (`FeedSheet`) is rendered only when the flag is on. So the running MVP is
  byte-for-byte unchanged by default; the flag (env `EXPO_PUBLIC_LOGGING_V2` or a
  runtime override) is the single switch, exactly as plan §2.1 intends.
- **Use-cases validate before writing and return `{ ok: false, error }` on
  failure**; the provider sets that error into store state and SKIPS the
  post-mutation refresh (a failure changed nothing, and `reconcileLoggingState`
  would otherwise clear the error). A success refreshes from the repo, which also
  clears any stale error.
- **Breast totals are always recomputed from segments**, never trusted as stored
  fields: `switchBreastSide`/`finishBreastFeed` recompute `totalLeftMs/RightMs` via
  `breastSegmentTotals`, and the active UI re-derives them every tick from
  `startedAt` (`useElapsedTime` + segment math). Nothing ticking is persisted, so
  totals are correct after any number of switches and after a restart.
- **Cancel ≠ finish:** cancel sets `status = 'cancelled'` (excluded from both the
  today read and active-session read) so an abandoned session never becomes a
  logged feed and never lingers as a timer (plan Phase 5 acceptance). Finish sets
  `completed` with a real `endedAt`.
- **Bottle "remember last milk type/amount" is in-memory for the session** (module
  vars in `BottleFeedForm`), not yet persisted. It satisfies the within-session
  preference (plan Phase 3) cheaply; durable persistence can layer on later without
  touching the use-case.
- **The provider repo is created with `useMemo([])`, not a lazy ref**, to satisfy
  `react-hooks/refs` (no ref access during render). The repository is a stateless
  AsyncStorage wrapper, so even an unlikely memo discard/recreate is harmless.
- **Task 06 fixed the legacy `endRunningSleep` bug in place rather than deferring
  it.** The v2 Sleep flow already finishes with `endedAt = now`, but the status
  doc's task-06 plan committed to the legacy fix too, the audit ranked it the
  highest-priority behavioral bug, and the plan's Sleep rule ("calculate elapsed
  from timestamps") is violated even on the legacy path. The change is one clamped
  line + a threaded `now`; the only test that encoded the old `+72 min` behavior
  (N2) was updated to assert the real elapsed time. The seed demo is unaffected
  (the orb timer was already live; finishing now matches it).
- **The Sleep finish clamps `endAt`/`endedAt` to ≥ `startAt`** in both the legacy
  `endRunningSleep` and (via `validateSessionRange`) the v2 `finishSleep`, so a
  backwards device clock can never persist `endedAt < startedAt`; v2 surfaces it
  as a recover/error state instead of writing a bad record (plan §6).
- **Sleep keeps the same provider pattern as Feed:** distinct `activeSleep` slot,
  validate-then-write use-cases that return `{ ok: false, error }`, refresh on
  success / set-error + skip-refresh on failure, and the shared mutation lock for
  double-tap safety. The use-cases are imported into the provider under `run*`
  aliases so the bound action names (`startSleep`/`finishSleep`/…) don't shadow.
- **"Started earlier" + "Add a completed sleep" pass explicit timestamps, not a
  business-logic branch** (plan Phase 6.2/6.4). The sheet converts a preset choice
  (N minutes ago / an N-minute completed sleep) into ISO `startedAt`/`endedAt` and
  hands them to the same `startSleep`/`saveCompletedSleep` use-cases, so a real
  time picker can replace the presets later without touching business logic.
- **Sleep's Quick Log card opens the v2 sheet, but the Hero stays legacy for now.**
  Unifying Hero + Quick Log + sheet on one v2 session (plan Phase 6.5 single source
  of truth) is the same "wire the rendered UI to the v2 store" work as the timeline
  + card subtitles, so it is deferred to **task 09** (integrate) to keep task 06 a
  clean application + UI increment, consistent with how task 05 handled Feed.
- **Task 07 Diaper is an INSTANT event, modelled like the bottle save, not the
  session flows.** It is created `completed` with `occurredAt = now` and no
  `startedAt`/`endedAt`, so it never touches the `activeSleep`/`activeBreastFeed`/
  `activePump` slots and never appears in `getActiveSessions`. The four kind
  buttons each call `saveDiaper(kind)` on a single tap and close the sheet — no
  intermediate selection and no Save button — so a wet diaper is exactly two taps
  (plan Phase 2). The legacy quick-log used three kinds (Wet/Dirty/Mixed) and a
  Save step; the v2 sheet adds `dry` and removes the Save step.
- **Diaper's success closes the sheet silently for now; the toast + Undo are
  deferred to task 10**, exactly as Feed/Sleep defer their visible-timeline wiring
  to task 09 and Undo to task 10. The use-case + idempotency are in place, so task
  10 only adds the shared `UndoableMutation` snapshot + toast on top — no rework of
  the diaper write path. This keeps task 07 a clean application + UI increment.
- **Task 08 encodes the pump "volume draft" as an `active` event with `endedAt`
  set — not a new status value.** `CareEventStatus` is a closed four-value union
  (`active`/`completed`/`cancelled`/`deleted`); rather than widen the whole model
  for one flow, `finishPump` leaves the event `active` and just stamps `endedAt`.
  Because `getActiveSessions` filters on `status === 'active'`, the finished pump
  stays in the active read, so it is recovered on restart with **zero** extra
  persistence — directly satisfying "the draft must survive sheet close and app
  restart" (plan Phase 7.2). `applyActiveSessions` reads "active pump with an
  `endedAt`" as the `pumpVolumeDraft`; `savePump` is the only thing that flips it to
  `completed`. (`elapsedMs`/`sessionElapsedMs` already key off `endedAt` regardless
  of status, so the draft shows a fixed, non-ticking duration.)
- **`activePump` keeps holding the full record while a draft is pending; the draft
  is a derived companion view.** This mirrors how `finishSleep`/`finishBreastFeed`
  operate on `state.active*` — the provider's `savePump`/`cancelPump` read the full
  event from `activePump`, while the UI switches to the volume step based on
  `pumpVolumeDraft != null`. `selectIsAnySessionActive` therefore reports `true`
  during a pending draft, which is correct (the pump workflow isn't finished) and is
  unused on the running-app path today.
- **Pump total is a selector (`pumpTotalVolumeMl`), never a stored field** (plan
  §7.3 "calculate Total; do not store it"). "Save without volume" is the SAME
  `savePump` use-case with `null` volumes (not 0) — `validatePumpVolumes` reserves a
  positive number for a recorded volume and `null` for "not recorded", so the only
  way to a zero-volume record is the explicit no-volume action. In the UI, a side
  left at 0 is sent as `null`, and "Save pump · 0 ml" is disabled so zero can't slip
  through the volume path.
- **Pump's `childId` is set to the family child as an optional association, even
  though pump belongs to the caregiver** (`subjectUserId`). The reads don't depend
  on it (`getActiveSessions` scopes pump by `subjectUserId`; `getTodayEvents` shows
  pump family-wide), so this just keeps the pump visible in the family timeline
  without affecting session scoping (plan §4.4).

## Known issues (found during audit, to fix in later tasks)

- ~~Sleep finish is hardcoded to +72 min~~ **FIXED (task 06):** legacy
  `endRunningSleep` (`src/data/mock.ts`) now finalizes at `endAt = now` (clamped
  ≥ `startAt`); `SLEEP_FINALIZE_MIN` removed. v2 `finishSleep` likewise uses
  `endedAt = now`.
- All four LIVE flows — Feed + Sleep + Diaper + Pump — are wired (tasks 05–08)
  behind the flag: the provider runs `hydrateLoggingState` on mount and
  `subscribeForeground` → `reconcileLoggingState` on foreground, so every active
  session (and the pump volume draft) is recovered from timestamps after a restart.
- The VISIBLE timeline + quick-log card subtitles/active-ring still read the legacy
  `useLocalEvents` store, so v2 Feed + Sleep + Diaper + Pump events are persisted +
  in `LoggingState` but not yet rendered there — **task 09** (integrate timeline)
  wires the rendered UI to the v2 store, and unifies the Sleep Hero with the v2
  session (single source of truth, plan Phase 6.5).
- ~~Diaper has no `dry` and quick-log is 3 taps, not 2~~ **FIXED (task 07):** the v2
  `DiaperSheet` adds `dry` and saves in two taps (`Diaper → Wet`). ~~Pump drops
  `both` and captures no volume~~ **FIXED (task 08):** the v2 `PumpSheet` supports
  left/right/both, a timestamp-based timer, and an optional post-finish volume.
  (Bottle volume/milk type ✓, Breast timers/side segments ✓ as of task 05; Sleep
  start/stop + completed ✓ as of task 06; Diaper wet/dirty/both/dry two-tap ✓ as of
  task 07; Pump side/timer/optional volume ✓ as of task 08 — all four audit gaps
  closed.)
- Undo is delete-newest only (no `UndoableMutation` snapshot / undo-finish) — none
  of the v2 flows (Feed, Sleep, Diaper, Pump) show Undo/toast yet (a successful save
  closes the sheet silently for now); **task 10** adds the shared Undo + the toast
  (e.g. `Diaper logged · wet`, `Pump saved · 110 ml`, plan §8).

## Last verification

- 2026-06-21 (task 08) — `npx tsc --noEmit` → exit 0. `npm run
  check:local-interactions` → **all 120 checks pass** (111 prior + 9 new, AA1–AA9,
  for the Pump use-cases: start creates one caregiver-scoped active pump with no
  endedAt and null volumes; a second start resumes with no duplicate; finish sets
  endedAt + a fixed duration but keeps the session active and yields a
  `pumpVolumeDraft`; Both + 50/60 ml completes with a derived 110 ml total
  (`pumpTotalVolumeMl`, not stored); save without volume stores null volumes +
  duration only; a single-side pump can't record the other side (rejected,
  `invalid_pump_volumes`, draft intact); the volume draft survives a restart via
  hydration; cancel discards; a pump and an active sleep coexist). `npm run lint`
  (`expo lint`) → exit 0, clean. `npm test` still not available (no runner; the
  smoke test is the substitute). MVP behavior is unchanged with the flag off: the
  new `PumpSheet` is only reachable when `loggingV2` is on (`(tabs)/index.tsx` gates
  the Pump card on the flag — `loggingV2 ? setPumpV2Open(true) : setSheet('pump')`),
  and the legacy `LogSheet` pump path is otherwise byte-for-byte untouched.
- 2026-06-21 (task 07) — `npx tsc --noEmit` → exit 0. `npm run
  check:local-interactions` → **all 111 checks pass** (105 prior + 6 new, Z1–Z6,
  for the Diaper use-case: "wet" creates one completed timer-less diaper in the
  timeline; every kind incl. **dry** maps to the exact kind; an unknown kind is
  rejected with `invalid_diaper_kind` and persists nothing; a double save with one
  `clientEventId` lands a single event; a diaper is never an active session; and a
  logged diaper survives a restart). `npm run lint` (`expo lint`) → exit 0, clean.
  `npm test` still not available (no runner; the smoke test is the substitute). MVP
  behavior is unchanged with the flag off: the new `DiaperSheet` is only reachable
  when `loggingV2` is on (`(tabs)/index.tsx` gates the Diaper card on the flag), and
  the legacy `LogSheet` diaper path is otherwise byte-for-byte untouched.
- 2026-06-21 (task 06) — `npx tsc --noEmit` → exit 0. `npm run
  check:local-interactions` → **all 105 checks pass** (97 prior + 8 new, Y1–Y8, for
  the Sleep use-cases: start creates one active sleep; start→+40m finish = 40m
  completed in the timeline; started-5m-earlier→+20m = 25m; second start resumes
  with no duplicate; finish with `endedAt < startedAt` rejected and nothing
  persisted; cancel discards; hydration restores after restart; `saveCompletedSleep`
  logs a completed sleep with no timer and rejects a future start). Also updated the
  one legacy check that encoded the `+72 min` bug (N2 → real 68m / "1h 08m").
  `npm run lint` (`expo lint`) → exit 0, clean. `npm test` still not available (no
  runner; the smoke test is the substitute). MVP behavior is unchanged with the
  flag off: the new `SleepSheet` is only reachable when `loggingV2` is on, and the
  legacy `handleSleepTap` orb path is otherwise untouched (the only legacy edit is
  the in-place `endRunningSleep` correctness fix, covered by the updated N2).
- 2026-06-21 (task 05) — `npx tsc --noEmit` → exit 0. `npm run
  check:local-interactions` → **all 97 checks pass** (87 prior + 10 new, X1–X10,
  for the Feed use-cases: bottle save/validation/idempotency and breast
  start/switch/finish totals incl. the canonical 5m/3m + multi-switch cases,
  resume-existing, hydration restore, same-side no-op, and cancel). `npm run lint`
  (`expo lint`) → exit 0, clean (fixed one `react-hooks/refs` finding by switching
  the provider repo to `useMemo`). `npm test` still not available (no runner; the
  smoke test is the substitute). MVP behavior is unchanged: `loggingV2` defaults to
  `false`, the provider does no I/O while off, and the new `FeedSheet` is only
  reachable when the flag is on (verified by gating in `featureFlags.ts`,
  `LoggingProvider.tsx`, and `(tabs)/index.tsx`).
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