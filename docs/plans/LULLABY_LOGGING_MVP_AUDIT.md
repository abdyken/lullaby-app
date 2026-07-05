# Lullaby Logging — Existing MVP Audit (Phase 0)

> Deliverable for plan Phase 0 ("Audit the current MVP") and status tasks **00**
> (audit existing MVP structure) and **01** (identify navigation, state, storage,
> logging code).
>
> Source of truth for the refactor: `docs/LULLABY_LOGGING_IMPLEMENTATION_PLAN_EN.md`.
> This document records **what exists today** and **the gap to the target**, so
> later tasks can refactor incrementally instead of rewriting.

All references are `file:line` against the repo at audit time.

---

## 0. TL;DR

- The MVP already has a clean, **pure-logic + thin-React + repository-boundary**
  architecture that the plan's `domain → application → data/state → UI` layering
  can grow into. We refactor in place; we do **not** rewrite.
- There is **one global state object** — `TonightState { events, orbView }`
  (`src/data/localInteractions.ts:32`) — with a **single `orbView`**. The plan
  explicitly forbids one global timer and requires **independent** sleep / breast
  / pump sessions. This is the central structural gap.
- **Sleep is the only "active session"** today, and its finish is **hardcoded to
  72 minutes** (`SLEEP_FINALIZE_MIN`, `endRunningSleep`, `src/data/mock.ts:214,354`)
  instead of `endedAt = now`. The live ticking duration is correct (timestamp
  based), but the saved end time is fake. **Highest-priority behavioral fix.**
- **Feed/Diaper/Pump are instant events**, not the flows the plan wants:
  - Feed: no breast left/right timers, no side switching, no segments; bottle has
    no volume / milk-type capture (sheet only offers Bottle/Left/Right).
  - Diaper: no `dry`; "both" is shown as "Mixed"; quick-log is 3 taps (open sheet
    → pick → Save), not 2.
  - Pump: no timer session, `both` is dropped (model side is `L | R` only), no
    volume capture, no caregiver-as-subject ownership.
- **No** `loggingV2` feature flag, **no** analytics, **no** notifications exist
  yet (clean slate for those plan phases).
- **No** `AppState` foreground reconciliation and **no** per-second display timer
  hook (`useElapsedTime`): durations recompute only on React re-render.
- Persistence works and survives restart: local AsyncStorage key
  `lullaby/local-events/v1`, plus an optional Supabase repository behind the same
  `EventRepository` boundary.

---

## 1. Tech stack & build

| Area | Value | Reference |
|---|---|---|
| Framework | Expo SDK 56, React Native 0.85.3, React 19.2.3 | `package.json` |
| Routing | `expo-router` ~56.2.11 (file-based) | `package.json`, `src/app/**` |
| Styling | NativeWind 4 + Tailwind 3, plus a hand-rolled theme | `tailwind.config.js`, `src/theme/index.ts` |
| Animation | `react-native-reanimated` 4, `react-native-svg` | `package.json` |
| Local storage | `@react-native-async-storage/async-storage` 2.2.0 | `src/data/localStorage.ts` |
| Backend (optional) | `@supabase/supabase-js` 2; gated, falls back to local | `src/sync/**`, `src/lib/supabase.ts` |
| Language | TypeScript ~6, `"strict": true`, path alias `@/* → src/*` | `tsconfig.json` |

### Verification commands available

| Command | Exists? | Notes |
|---|---|---|
| `npm run lint` | ✅ | `expo lint` (eslint 9 + `eslint-config-expo`). |
| `npm run check:local-interactions` | ✅ | `tsx scripts/check-local-interactions.ts` — a **60-check** pure-logic smoke test (no RN, no phone). This is the de-facto unit test suite. |
| `npm run typecheck` | ❌ (no script) | But `tsc` is installed — use `npx tsc --noEmit` (exits 0 at audit time). |
| `npm test` | ❌ | No test runner (Jest/Vitest) configured. The smoke test is the substitute; extend it for new logic. |

**Baseline at audit time:** `npx tsc --noEmit` → exit 0; smoke test → all 60 checks pass.

---

## 2. Navigation & providers

- Root: `src/app/_layout.tsx` — loads fonts, wraps app in
  `SafeAreaProvider → ThemeProvider → RootShell`.
- Tabs: `src/app/(tabs)/_layout.tsx` — three tabs via a custom `LullabyTabBar`:
  1. **Tonight** (`index.tsx`) — the live home: orb hero + quick-log grid + capped timeline. **All logging happens here.**
  2. **Log** (`log.tsx`) — read-only history (filters, day grouping, recap). No logging controls.
  3. **Reassure** (`reassure.tsx`) — calm morning recap. Out of logging scope.
- Provider stack inside tabs: `AuthProvider → AuthGate → LocalEventProvider`
  (`src/app/(tabs)/_layout.tsx:39`). `LocalEventProvider` is the single owner of
  night state, shared by Tonight and Log.
- **There is no central "Log" chooser button** (plan §7.3). Logging is initiated
  from the Tonight quick-log grid and the orb's primary action only.

---

## 3. State management — the single store

`LocalEventProvider` (`src/state/LocalEventProvider.tsx`) holds:

```ts
// src/data/localInteractions.ts:32
type TonightState = { events: LogEvent[]; orbView: OrbView };
// OrbView = 'calm' | 'feed' | 'sleep' | 'diaper'   (src/data/currentState.ts:62)
```

- All mutations go through **pure helpers** in `src/data/localInteractions.ts`
  (`addFeed`, `addDiaper`, `addPump`, `addNote`, `handleQuickLog`,
  `handlePrimaryAction`, `undoLastEvent`, `undoLastOwnEvent`). The provider is a
  thin React wrapper that calls them and shows a toast.
- Persistence: a `useEffect` saves on every change after hydration
  (`LocalEventProvider.tsx:229`). Local-only mode whole-state-saves to
  AsyncStorage; Supabase mode pushes a per-event diff (`diffEvents`).
- `orbView` is **device-local view state**, not persisted remotely; derived from
  events on the Supabase side (`supabaseRepository.ts:51` → `initTonightState`).
- The context exposes: `events, orbView, orb, activeTile, tonightTimeline,
  fullTimeline, isHydrated, syncMode, syncStatus, toast`, plus handlers
  `handleSleepTap, saveFeed, saveDiaper, saveNote, savePump,
  handlePrimaryAction, undoLastEvent, dismissToast, resetLocalEvents`.

**Implication for the plan:** the target needs *multiple* concurrent active
sessions (`activeSleep`, `activeBreastFeed`, `activePump`, `pumpVolumeDraft` —
plan §1.3). The single `orbView` cannot represent "sleep AND pump running at
once" (plan §4 / Phase 4 require it). The store must grow distinct
active-session slots while keeping `events` as the timeline source.

---

## 4. Where each record is created

The current event shape (`src/data/models.ts:71`):

```ts
type LogEventType = 'feed' | 'sleep' | 'diaper' | 'pump' | 'note';
interface LogEvent {
  id: string; babyId: string; caregiverId: string;
  type: LogEventType;
  startAt: string;            // ISO
  endAt: string | null;       // null = instant OR still-running
  meta: LogEventMeta;         // { side?, kind?, amountMl?, durationMin?, label?, note? }
  createdAt: string;          // ISO
}
```

Factories live in `src/data/mock.ts`; IDs come from a module counter
`nextId() → local-${type}-${now}-${counter}` (`mock.ts:216`).

| Type | UI entry | Handler (provider) | Pure fn | Factory | Notes / current shape |
|---|---|---|---|---|---|
| **Feed** | Quick-log tile → `LogSheet` (Bottle/Left/Right) → Save | `saveFeed(details)` (`LocalEventProvider.tsx:281`) | `addFeed` (`localInteractions.ts:113`) | `createFeedEvent` (`mock.ts:247`) | **Instant.** Backdates a fake `startAt = now − 8m` and sets `endAt = now`. `meta.side = 'L'|'R'` or none (bottle). 45s dedup window. No real timer, no segments, no volume/milk type. |
| **Sleep (start)** | Quick-log tile **or** orb "Start sleep" | `handleSleepTap` / `handlePrimaryAction` (`LocalEventProvider.tsx:268,315`) | `handleQuickLog(…, 'sleep')` / `handlePrimaryAction` (`localInteractions.ts:54,89`) | `createSleepEvent` (`mock.ts:269`) | **Active session.** `endAt = null`, `meta = {}`. Guarded so only one sleep runs. |
| **Sleep (finish)** | Orb "Wake baby" | `handlePrimaryAction` | `endRunningSleep` (`localInteractions.ts:91` → `mock.ts:354`) | — | **BUG vs plan:** sets `endAt = startAt + 72min` (hardcoded `SLEEP_FINALIZE_MIN`), **not** `now`. |
| **Diaper** | Quick-log tile → `LogSheet` (Wet/Dirty/Mixed) → Save | `saveDiaper(details)` (`LocalEventProvider.tsx:291`) | `addDiaper` (`localInteractions.ts:129`) | `createDiaperEvent` (`mock.ts:287`) | **Instant.** `meta.kind = 'wet'|'dirty'|'both'`. No `dry`. 45s dedup. |
| **Pump** | Quick-log tile → `LogSheet` (Left/Right/Both) → Save | `savePump(details)` (`LocalEventProvider.tsx:308`) | `addPump` (`localInteractions.ts:159`) | `createPumpEvent` (`mock.ts:311`) | **Instant.** `meta.side` only when `L`/`R` (**`both` is dropped**). No timer, no volume capture, no orb state. |
| **Note** | (sheet config exists; not wired into the grid) | `saveNote(details)` (`LocalEventProvider.tsx:301`) | `addNote` (`localInteractions.ts:145`) | `createNoteEvent` (`mock.ts:332`) | **Out of plan scope** but exists. `meta.label`/`meta.note`. Keep (model is extensible); do not surface in new flows. |

`LogSheet` (`src/components/LogSheet.tsx`) is a **dumb, config-driven** sheet: it
renders a row of option pills + a Save button and calls `onSave(selectedKey)`.
The per-type config (titles, options, default, accent) lives in the `SHEETS` map
in `src/app/(tabs)/index.tsx:77-130`. New flows should follow this pattern but
will need **richer bodies** (timers, steppers) than the single-row pill picker.

---

## 5. Active timers / sessions — how they're stored & computed

- **Storage of "active":** an in-progress interval is just `endAt === null`. Only
  **sleep** uses this as a live session today (`hasRunningSleep`, `mock.ts:223`).
  Feed's `endAt` is set immediately, so feed is never "running" from the store's
  view (despite `getCurrentBabyState` having a dormant `activeFeed` branch,
  `currentState.ts:203`).
- **Elapsed computation is timestamp-based and correct** for display:
  - `durationLabel(startAt, ref)` (`currentState.ts:160`)
  - `elapsedProgress(startAt, ref, fullScale)` (`currentState.ts:177`)
  - These derive `now − startAt`; **no ticking counter is persisted** (good, matches plan §5 storage rule).
- **Gaps vs plan §6:**
  - **No `useElapsedTime` hook** and **no `setInterval`** to redraw the timer each
    second. The orb's duration only updates when the component re-renders (e.g.
    other state changes / the breathe animation does not drive text). A running
    timer can look frozen.
  - **No `AppState` listener** anywhere → no "recalculate on foreground / re-read
    active sessions / flush sync queue" (plan §6, Phase 4). Restart recovery works
    only because the persisted `startAt` is re-read on mount and duration is
    recomputed lazily.
  - **No time validation** (`endedAt < startedAt`, future `startedAt`, clock-change
    recovery — plan §6 "Time validations").

---

## 6. Storage keys & payloads

### Local (AsyncStorage)

- **Key:** `lullaby/local-events/v1` (`src/data/persistedState.ts:16`, versioned).
- **Payload:** `JSON.stringify({ events, orbView })` — *only* the night loop.
  Baby/caregiver/settings are **not** persisted here.
- Load is defensive: bad JSON / shape / unknown `orbView` → `null` → fall back to
  seed. Duplicate event IDs are repaired on load (`parsePersistedState`,
  `persistedState.ts:75`).
- Other AsyncStorage users: theme surface mode (`ThemeProvider`) and the handoff
  cursor (`src/data/handoffCursor.ts`) — independent of the event store.

### Remote (Supabase) — `public.events`

Schema `supabase/migrations/20260618000004_create_events.sql`:

```sql
create table public.events (
  id           text primary key default gen_random_uuid()::text,  -- text so local + remote ids share one column
  baby_id      uuid not null references public.babies(id) on delete cascade,
  caregiver_id uuid not null references public.profiles(id) on delete set null,
  type         text not null check (type in ('feed','sleep','diaper','pump','note')),
  start_at     timestamptz not null,
  end_at       timestamptz,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
```

- RLS gates every op on `is_baby_caregiver(baby_id)`; inserts must stamp
  `caregiver_id = auth.uid()`.
- Row ↔ model conversion is centralized in `src/sync/schema.ts`
  (`eventFromRow`/`eventToRow`); `meta` is the `LogEventMeta` object verbatim.
- Writes are granular & idempotent by `id` (`supabaseRepository.applyChanges`,
  `supabaseRepository.ts:94`); realtime re-reads the night on any change
  (`subscribe`, `:119`).

**Note for the plan's richer model:** because `meta` is JSONB and `id` is `text`,
the new `CareEvent` fields (segments, `clientEventId`, `syncStatus`, `version`,
`subjectUserId`, etc.) can land **without a destructive migration** — extend the
JSONB and/or add nullable columns. The `LegacyLoggingMapper` (plan §2.4) maps the
existing flat `meta` into the new discriminated payloads.

---

## 7. Timeline dependencies on the current model

- Display rows are built by `getTonightTimeline(events, now)` → `TimelineEntry[]`
  (`mock.ts:172`). `TimelineEntry` = `{ id, time, kind, label, caregiverName,
  caregiverColor }` (`mock.ts:109`). The label formatter is `entryLabel`
  (`mock.ts:141`) — a `switch` on `event.type`. This is the single place that
  turns an event into human text; it matches the plan's `formatTimelineEvent`
  intent (§7.4) and is where new types/labels plug in.
- Consumers:
  - Tonight home: capped to 4 rows (`cappedTimeline`, `localInteractions.ts:228`),
    rendered by `TimelineCard` → `TimelineItem`.
  - Log tab: full history grouped by day, **re-implements** a recap + interval
    helpers locally (`src/app/(tabs)/log.tsx:31-78`) rather than reusing
    `mock.ts`. (Minor duplication to consolidate later.)
  - `TimelineItem` (`src/components/TimelineItem.tsx`) maps `kind → icon/tint`
    via `KIND_TINT`/`KIND_COLOR`; `pump`/`note` currently reuse the sleep
    (lavender) tone.
- Derived summaries also depend on the model: `deriveNightStatus`,
  `buildTonightStatus`, `buildNightRecap`, `buildQuickLogMeta`, `deriveHandoff`,
  `buildHandoffSummary` (all in `currentState.ts`) and the Log recap. Any change
  to event shape must keep these (and their smoke-test assertions) working.

---

## 8. Analytics & notifications

- **None present.** No analytics SDK, no `track()` calls, no `expo-notifications`,
  no feature-flag system (`grep` over `src` returns nothing for
  analytics/segment/amplitude/mixpanel/notifications/featureFlag/loggingV2).
- → Plan §12 (analytics) and any notification work are **greenfield**; nothing to
  migrate or preserve.

---

## 9. Anonymized example of current data

Seed (`buildSeedEvents`, `mock.ts:65`), shapes a real persisted row would take:

```jsonc
// A completed breast feed (left), ~2h ago
{ "id":"evt-feed-1","babyId":"baby-mia","caregiverId":"cg-mom","type":"feed",
  "startAt":"2026-06-21T02:10:00.000Z","endAt":"2026-06-21T02:21:00.000Z",
  "meta":{ "side":"L" },"createdAt":"2026-06-21T02:21:00.000Z" }

// An instant wet diaper
{ "id":"evt-diaper-1","babyId":"baby-mia","caregiverId":"cg-dad","type":"diaper",
  "startAt":"2026-06-21T02:48:00.000Z","endAt":null,
  "meta":{ "kind":"wet" },"createdAt":"2026-06-21T02:48:00.000Z" }

// A RUNNING sleep (endAt null = active session)
{ "id":"evt-sleep-1","babyId":"baby-mia","caregiverId":"cg-mom","type":"sleep",
  "startAt":"2026-06-21T03:16:00.000Z","endAt":null,
  "meta":{},"createdAt":"2026-06-21T03:16:00.000Z" }

// A locally-created bottle feed (no side) — id from the runtime counter
{ "id":"local-feed-1718940000000-3","babyId":"baby-mia","caregiverId":"cg-mom",
  "type":"feed","startAt":"…","endAt":"…","meta":{},"createdAt":"…" }
```

---

## 10. Field mapping — current model → target `CareEvent`

Target shapes are from plan §4. Current → new:

| Current (`LogEvent`) | Target (`CareEventBase` + subtype) | Mapping note |
|---|---|---|
| `id` | `id` | Keep. Plan also adds `clientEventId` (idempotency) — **new**, generate on create. |
| `babyId` | `childId` | Rename. Pump may set `childId = null` and use `subjectUserId`. |
| `caregiverId` | `createdByUserId` (+ `subjectUserId` for pump) | Rename; pump adds subject. |
| — | `familyId` | **New** (group scope). Derive from baby↔caregiver link. |
| `type` | `type` | Same union minus `note` (note stays as an out-of-scope extension). |
| — | `status: 'active'|'completed'|'cancelled'|'deleted'` | **New.** Today: `endAt===null` ≈ active (sleep) or instant; deletion is a hard remove. Add soft-delete. |
| `startAt` | `startedAt` (+ `occurredAt`) | Rename; instant events use `occurredAt`. |
| `endAt` | `endedAt` | Rename. **Fix sleep to store real `now`, not +72m.** |
| — | `timezoneOffsetMinutes`, `createdAt`, `updatedAt`, `version`, `syncStatus` | **New** metadata. `createdAt` already exists; rest are new (default sensibly in the mapper). |
| `meta.side: 'L'|'R'` | Breast: `details.activeSide` + `details.segments[].side: 'left'|'right'`; Pump: `details.side: 'left'|'right'|'both'` | Expand `L/R` → `left/right`; **`both` becomes representable** for pump. |
| `meta.amountMl` | Bottle: `details.amountMl`; Pump: `details.leftVolumeMl`/`rightVolumeMl` | Split pump volume by side. |
| `meta.durationMin` | (derived) | Drop as stored field; compute from segments/timestamps. |
| `meta.kind: 'wet'|'dirty'|'both'` | Diaper `details.kind: 'wet'|'dirty'|'both'|'dry'` | **Add `dry`.** |
| — | Bottle `details.milkType`, Diaper `details.rash/note`, Breast `details.totalLeftMs/totalRightMs` | **New** detail fields. |
| `meta.label`/`meta.note` | (note out of scope) | Preserve as-is for `note`; not part of the four core flows. |

The mapper is **non-destructive**: old rows stay valid; new rows carry the richer
JSONB. This satisfies plan §2.4 (don't delete old data before migration is
verified) and §13 PR ordering.

---

## 11. Gap analysis vs. the plan (prioritized)

Ordered to match the plan's recommended build order (Diaper → Bottle → Session
engine → Breast → Sleep → Pump → Timeline/Undo).

1. **Foundation (plan Phase 1):** introduce the discriminated `CareEvent` union,
   a `Clock` abstraction, validators (`validateBottleAmount`,
   `validateSessionRange`, `validateBreastSegments`, `validatePumpVolumes`,
   `validateDiaperKind`), `clientEventId`, and `syncStatus`/`version`. Today: a
   single flat `LogEvent`, no validators, no clock seam (helpers take a `now`
   arg, which is a good start), counter-based IDs.
2. **Feature flag `loggingV2`:** does not exist. Add it so the new domain can ship
   beside the old MVP (plan §2.1). *(Lands when the new domain module is created,
   not in this audit.)*
3. **Diaper (Phase 2):** add `dry`; make it **two taps** (tap kind → save
   immediately, no separate Save button / sheet round-trip); add real
   soft-delete Undo. Today: 3 taps via the shared sheet; "both" labeled "Mixed".
4. **Bottle (Phase 3):** add volume presets + ±10 stepper and milk type
   (`breast_milk|formula|mixed|other`); persist last milk type as a preference.
   Today: bottle records nothing but "feed with no side".
5. **Session engine (Phase 4):** the big one — replace single `orbView`-as-session
   with independent persisted sessions (`activeSleep`, `activeBreastFeed`,
   `activePump`), `startSession/finishSession/cancelSession/recoverActiveSessions`,
   `useElapsedTime`, and an `AppState` foreground reconcile. None of this exists.
6. **Breast (Phase 5):** left/right **segments**, side switching, totals from
   segments, finish/cancel. Today: feed is instant with a fake duration.
7. **Sleep (Phase 6):** **fix the 72-min finalize → `endedAt = now`**; "start
   earlier"/manual-completed accepting arbitrary `startedAt`; single source of
   truth shared by hero + quick-log (already shared via the store — keep that).
8. **Pump (Phase 7):** timer session, `left/right/both`, persistent volume draft
   surviving restart, optional volume, caregiver as `subjectUserId`. Today:
   instant, `both` dropped, no volume.
9. **Undo (Phase 8):** model `UndoableMutation` (snapshot + kind + expiry); support
   undo-finish (restore active session) and undo-update, route undo through the
   sync queue. Today: delete-newest only (`undoLastEvent`/`undoLastOwnEvent`).
10. **Sync/idempotency (Phase 9):** add `clientEventId` idempotency and `version`
    conflict handling, plus the `LegacyLoggingMapper`. The repository boundary and
    realtime already exist — extend, don't replace.

**What we explicitly keep (don't rewrite):** the pure-logic/React-wrapper split,
the `EventRepository` boundary (local + Supabase + resolve), the timeline
formatter seam, the toast/undo UX shell, the theme, and the smoke-test harness
(extend it for new logic — it is our only test runner).

---

## 12. Recommended first code step

Per plan §16 and the status queue, the next task (**02**) is the foundation
types. Build the new `CareEvent` union + `Clock` + validators **next to** the
existing model (do not delete `LogEvent` yet), then layer the repository/store,
then ship Diaper end-to-end through the new path behind `loggingV2` before
touching Bottle and the session engine.

---

## 13. Open questions / decisions for later tasks

- **`note` type:** keep it as an out-of-scope extension (it's persisted and
  smoke-tested) rather than deleting it. The new union focuses on
  feed/sleep/diaper/pump; note can ride along in `meta`-style extensibility.
- **`familyId` source:** the model has baby↔caregiver links
  (`baby_caregivers`) but no explicit "family". Decide whether `familyId` ==
  baby owner's group or a new concept; for the first pass it can mirror the
  existing baby scope.
- **ID strategy:** move from the counter-based `local-…` IDs to a UUID +
  `clientEventId` so retries are idempotent (plan §4 / §9). The Supabase `id`
  column is already `text`, so this needs no schema change.
