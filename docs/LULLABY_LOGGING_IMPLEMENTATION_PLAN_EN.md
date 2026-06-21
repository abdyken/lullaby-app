# Lullaby — Feed, Sleep, Diaper, and Pump Implementation Plan for React Native

> Status: implementation plan for refactoring an existing MVP.  
> Goal: replace the current logging mechanics while keeping the existing Lullaby visual design.  
> Scope: four core functions — **Feed, Sleep, Diaper, Pump**, shared Quick Log, active sessions, timeline, Undo, local persistence, and sync.

---

## 1. Target result

The Today screen keeps four cards:

```text
[ Feed ]   [ Sleep ]
[ Diaper ] [ Pump  ]
```

Each card opens its own purpose-built flow, not one universal form.

| Feature | Main UX model | Target flow |
|---|---|---|
| Feed / Breast | active session | choose side → start → switch sides → finish |
| Feed / Bottle | quantity event | choose amount and milk type → save |
| Sleep | active session | start now/earlier → finish when baby wakes up |
| Diaper | instant event | choose Wet/Dirty/Both/Dry → save immediately |
| Pump | active session + final volume | choose side → start → finish → add volume or save without it |

### Required behavior

- An active timer must not be lost after the app is closed.
- When the app returns from background, duration is recalculated from the start timestamp.
- Quick Log shows either the active state or the latest event.
- A saved event appears in the timeline immediately.
- Undo is shown after saving.
- Offline saving works without waiting for the server.
- Feed, Sleep, and Pump use independent sessions; do not implement one global timer for the whole app.
- The Sleep hero button and the Quick Log Sleep card control the same sleep session.

---

## 2. Refactoring principles for the existing MVP

Do not rewrite the whole application in one huge PR.

### 2.1. Create the new logging domain next to the old one first

Add a feature flag:

```ts
loggingV2: boolean;
```

While `loggingV2 === false`, the user sees the old MVP. The new implementation should be enabled first only for dev/test accounts.

### 2.2. Do not bind new business logic to components

Components should not independently:

- calculate final intervals;
- generate identifiers;
- write directly to AsyncStorage/API;
- resolve sync conflicts;
- keep an active session as local `useState`.

The UI calls a use case/store action, while business logic lives separately.

### 2.3. Use the existing backend and state manager through adapters

This plan does not require switching to Redux, Zustand, MobX, or any other store. Use the current state manager, but hide it behind a single logging feature API.

The same applies to the database: first implement `LoggingRepository`, then connect the current backend/local storage to it.

### 2.4. Do not delete old data before migration is verified

Order:

1. Define the format of existing Feed/Sleep/Diaper/Pump records.
2. Write `LegacyLoggingMapper`.
3. Test the conversion on a copy of the data.
4. Switch timeline reads to the new model.
5. Only after that, stop writing to the old format.

---

## 3. Recommended feature structure

```text
src/
  features/
    logging/
      domain/
        types.ts
        rules.ts
        selectors.ts
        errors.ts

      application/
        startBreastFeed.ts
        switchBreastSide.ts
        finishBreastFeed.ts
        saveBottleFeed.ts
        startSleep.ts
        finishSleep.ts
        saveDiaper.ts
        startPump.ts
        finishPump.ts
        savePump.ts
        undoLoggingMutation.ts

      data/
        LoggingRepository.ts
        LoggingRepositoryImpl.ts
        LoggingSyncQueue.ts
        LegacyLoggingMapper.ts

      state/
        loggingStore.ts
        loggingSelectors.ts
        loggingHydration.ts

      timer/
        clock.ts
        useElapsedTime.ts
        sessionMath.ts

      ui/
        LoggingSheet.tsx
        LoggingChooser.tsx
        ActiveSessionCard.tsx
        QuickLogGrid.tsx
        LoggingToast.tsx
        TimelineItem.tsx

      feed/
        FeedSheet.tsx
        BreastFeedIdle.tsx
        BreastFeedActive.tsx
        BottleFeedForm.tsx

      sleep/
        SleepSheet.tsx
        SleepIdle.tsx
        SleepActive.tsx

      diaper/
        DiaperSheet.tsx
        DiaperTypeButton.tsx

      pump/
        PumpSheet.tsx
        PumpIdle.tsx
        PumpActive.tsx
        PumpVolumeDraft.tsx
```

You do not have to copy this structure exactly. The important separation is:

```text
domain → application → data/state → UI
```

---

## 4. Unified event model

In TypeScript, use a discriminated union. This gives you one shared timeline while keeping a different validated payload for every feature.

```ts
export type ISODateTime = string;

export type SyncStatus =
  | 'local'
  | 'pending'
  | 'synced'
  | 'failed';

export interface CareEventBase {
  id: string;
  clientEventId: string;
  familyId: string;
  childId: string | null;
  createdByUserId: string;

  type: 'feed' | 'sleep' | 'diaper' | 'pump';
  status: 'active' | 'completed' | 'cancelled' | 'deleted';

  occurredAt: ISODateTime;
  startedAt: ISODateTime | null;
  endedAt: ISODateTime | null;

  timezoneOffsetMinutes: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;

  syncStatus: SyncStatus;
  version: number;
}
```

### 4.1. Feed

```ts
export interface BreastSideSegment {
  id: string;
  side: 'left' | 'right';
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
}

export interface BreastFeedEvent extends CareEventBase {
  type: 'feed';
  childId: string;
  method: 'breast';
  details: {
    activeSide: 'left' | 'right' | null;
    segments: BreastSideSegment[];
    totalLeftMs: number;
    totalRightMs: number;
  };
}

export interface BottleFeedEvent extends CareEventBase {
  type: 'feed';
  childId: string;
  method: 'bottle';
  status: 'completed' | 'deleted';
  details: {
    amountMl: number;
    milkType: 'breast_milk' | 'formula' | 'mixed' | 'other';
  };
}
```

Store side segments instead of constantly mutating only `leftMs/rightMs`. Segments preserve the switch history and allow the session to be restored correctly.

### 4.2. Sleep

```ts
export interface SleepEvent extends CareEventBase {
  type: 'sleep';
  childId: string;
  details: {
    sleepType: 'nap' | 'night' | 'unknown';
  };
}
```

### 4.3. Diaper

```ts
export interface DiaperEvent extends CareEventBase {
  type: 'diaper';
  childId: string;
  status: 'completed' | 'deleted';
  details: {
    kind: 'wet' | 'dirty' | 'both' | 'dry';
    rash?: boolean;
    note?: string;
  };
}
```

`rash` and `note` can stay in the model, but they should not be shown in the main Quick Log flow.

### 4.4. Pump

Pump belongs to the nursing/pumping caregiver first, not directly to the baby. `childId` can be `null` or used only as an optional family association.

```ts
export interface PumpEvent extends CareEventBase {
  type: 'pump';
  childId: string | null;
  subjectUserId: string;
  details: {
    side: 'left' | 'right' | 'both';
    leftVolumeMl: number | null;
    rightVolumeMl: number | null;
  };
}
```

### 4.5. Final union

```ts
export type CareEvent =
  | BreastFeedEvent
  | BottleFeedEvent
  | SleepEvent
  | DiaperEvent
  | PumpEvent;
```

---

## 5. Repository contract

The UI and store should not know whether an event is stored in SQLite, AsyncStorage, WatermelonDB, Realm, or on the server.

```ts
export interface LoggingRepository {
  getTodayEvents(params: {
    familyId: string;
    childId: string;
  }): Promise<CareEvent[]>;

  getActiveSessions(params: {
    familyId: string;
    childId: string;
    userId: string;
  }): Promise<CareEvent[]>;

  createEvent(event: CareEvent): Promise<void>;
  updateEvent(event: CareEvent): Promise<void>;
  softDeleteEvent(eventId: string): Promise<void>;

  enqueueSync(eventId: string): Promise<void>;
}
```

### Storage rule

- The source of truth for an active session is the saved `startedAt`, `endedAt`, and side segments.
- Do not save a new elapsed time value every second.
- `setInterval` is used only to redraw the timer text.
- To recover after a restart, read the active session again and calculate `now - startedAt`.

### AsyncStorage

Do not use AsyncStorage as the only database for the whole logging history. It works for small preferences, feature flags, and simple draft values, but it does not replace a real queryable event store. If the current MVP already uses AsyncStorage, first hide it behind `LoggingRepository`, then replace the storage in a separate step.

---

## 6. Clock and timers

Create a time abstraction so sessions can be tested without real waiting.

```ts
export interface Clock {
  now(): number;
  nowIso(): ISODateTime;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};
```

### Hook only for display

```ts
export function useElapsedTime(
  startedAt: string | null,
  isActive: boolean,
): number {
  // Returns Date.now() - startedAt.
  // Updates the UI once per second only while isActive === true.
}
```

### AppState behavior

When the app becomes `active`:

1. re-read active sessions from the repository;
2. recalculate all durations from timestamps;
3. update Quick Log and Hero;
4. if there are pending mutations, attempt to sync the queue.

Do not try to keep a precise JavaScript interval running in the background.

### Time validations

- Do not allow `endedAt < startedAt`.
- If the system time changed and the duration becomes negative, show a recover/error state instead of saving an invalid record.
- For manual backdating, store the actual selected time, not a string like `5 minutes ago`.

---

## 7. Shared UI contract

### 7.1. QuickLogGrid

```ts
interface QuickLogCardModel {
  type: 'feed' | 'sleep' | 'diaper' | 'pump';
  title: string;
  subtitle: string;
  isActive: boolean;
  onPress(): void;
}
```

The subtitle is built by a selector, not inside the card.

Examples:

```text
Feed    Feeding · 12m · right
Feed    2h 45m ago · breast, left

Sleep   Sleeping · 42m
Sleep   Awake for 1h 24m

Diaper  1h 10m ago · wet

Pump    Pumping · 18m · both
Pump    Finished · add volume
Pump    4h 20m ago · 90 ml
```

### 7.2. LoggingSheet

One visual container, but a different body:

```tsx
<LoggingSheet type="feed">
  <FeedSheet />
</LoggingSheet>
```

Do not create one universal form with conditional fields.

### 7.3. Global Log button

The central `Log` button opens a chooser:

```text
What would you like to log?

[ Feed ]   [ Sleep ]
[ Diaper ] [ Pump  ]
```

It must not automatically open Feed.

### 7.4. Timeline

Timeline reads a single `CareEvent[]` array and chooses a formatter by event type.

```ts
formatTimelineEvent(event: CareEvent): {
  title: string;
  subtitle: string;
  icon: IconName;
  tint: string;
};
```

---

# 8. Step-by-step implementation

## Phase 0 — audit the current MVP

- [ ] Find every place where Feed/Sleep/Diaper/Pump records are created.
- [ ] Find every place where active timers are stored.
- [ ] Document the current API payloads and local storage keys.
- [ ] Find analytics, notifications, and timeline dependencies on the old model.
- [ ] Prepare real anonymized examples of old data.
- [ ] Create a mapping table: old field → new field.
- [ ] Add the `loggingV2` feature flag.

### Phase result

The new feature can be enabled for a test user without breaking the production MVP.

---

## Phase 1 — foundation

### 1.1. Domain types

- [ ] Add `CareEventBase` and the four event types.
- [ ] Add a helper for UUID/clientEventId.
- [ ] Add `Clock`.
- [ ] Add validators.

Minimum validators:

```ts
validateBottleAmount(amountMl);
validateSessionRange(startedAt, endedAt);
validateBreastSegments(segments);
validatePumpVolumes(details);
validateDiaperKind(kind);
```

### 1.2. Repository

- [ ] Create the `LoggingRepository` interface.
- [ ] Connect the existing local storage/API through `LoggingRepositoryImpl`.
- [ ] Implement create/update/soft delete.
- [ ] Implement reading today’s events.
- [ ] Implement reading active sessions.

### 1.3. Store

Minimum state:

```ts
interface LoggingState {
  hydrated: boolean;
  todayEvents: CareEvent[];
  activeBreastFeed: BreastFeedEvent | null;
  activeSleep: SleepEvent | null;
  activePump: PumpEvent | null;
  pumpVolumeDraft: PumpVolumeDraft | null;
  lastMutation: UndoableMutation | null;
  error: LoggingError | null;
}
```

- [ ] Keep UI drafts separate from saved events.
- [ ] Run `hydrateLogging()` after app launch.
- [ ] Run reconciliation again after foreground.

### 1.4. Optimistic update and sync queue

- [ ] Save locally first.
- [ ] Update the UI immediately.
- [ ] Mark the event as `syncStatus: 'pending'`.
- [ ] Send it to the backend in the background during the current runtime.
- [ ] On error, keep the event locally and show a subtle sync failed status.
- [ ] Use `clientEventId` as an idempotency key so retry does not create duplicates.

### Phase result

A test event can be created, the app can be restarted, and the event is still visible in the timeline.

---

## Phase 2 — implement Diaper first

Diaper is the simplest flow and the best way to validate the new architecture.

### States

```text
idle → saving → saved
              ↘ error
saved → undo → deleted
```

### UI

```text
Diaper

[ Wet ]
[ Dirty ]
[ Both ]
[ Dry ]
```

### Implementation

- [ ] Open `DiaperSheet` from Quick Log press.
- [ ] Each type button calls `saveDiaper(kind)`.
- [ ] The event gets `occurredAt = now`.
- [ ] Close the sheet immediately after local success.
- [ ] Add the event to the top of the timeline.
- [ ] Update the card subtitle.
- [ ] Show Toast: `Diaper logged · wet` + Undo.
- [ ] Do not show a separate Save button.

### Use case

```ts
saveDiaper({
  familyId,
  childId,
  createdByUserId,
  kind,
  occurredAt,
});
```

### Acceptance criteria

- [ ] Wet diaper is logged in two taps: `Diaper → Wet`.
- [ ] A repeated fast tap does not create two events because of double press.
- [ ] Undo deletes exactly the event that was just created.
- [ ] Offline logging survives app restart.
- [ ] VoiceOver/TalkBack announces the type of each button.

---

## Phase 3 — Feed / Bottle

Bottle is an instant quantity event, not an active timer.

### States

```text
editing → saving → saved
                 ↘ error
```

### UI

```text
Feed
[ Breast ] [ Bottle ]

[ 60 ml ] [ 90 ml ] [ 120 ml ] [ 150 ml ]

[ -10 ]   120 ml   [ +10 ]

[ Breast milk ] [ Formula ]

[ Save bottle · 120 ml ]
```

### Implementation

- [ ] Create `FeedSheet` with `Breast / Bottle` tabs.
- [ ] Keep the Bottle draft locally in UI/store draft state.
- [ ] Remember the latest milk type as a preference.
- [ ] Remember recent/frequent amounts for presets later; for the first version, use fixed presets.
- [ ] Stepper changes the amount by 10 ml.
- [ ] Do not allow save when `amountMl <= 0`.
- [ ] On Save, create a completed BottleFeedEvent.
- [ ] Close the sheet, update timeline and Quick Log.
- [ ] Show Undo.

### Acceptance criteria

- [ ] Bottle 120 ml is saved without opening the keyboard.
- [ ] Selected milk type appears in the timeline/edit screen.
- [ ] Double tap on Save creates one event.
- [ ] When offline, the event receives pending status but the UI is not blocked.
- [ ] After reload, the latest record is shown on the Feed card.

---

## Phase 4 — shared Session Engine

Before Breast, Sleep, and Pump, implement the shared active-session infrastructure.

### Session rules

- One active sleep session per child.
- One active breastfeeding session per child within the current family.
- One active pump session per caregiver.
- Sleep can run at the same time as Pump.
- Do not use one global `activeTimer`.

### API

```ts
startSession(event: CareEvent): Promise<void>;
finishSession(eventId: string, endedAt: ISODateTime): Promise<void>;
cancelSession(eventId: string): Promise<void>;
recoverActiveSessions(): Promise<void>;
```

### Implementation

- [ ] Save the active event before opening the timer UI.
- [ ] Timer text is calculated from timestamps.
- [ ] Closing the sheet does not finish the session.
- [ ] App restart restores the active state.
- [ ] AppState foreground triggers reconciliation.
- [ ] Cancel does not convert the session into a completed event.
- [ ] If an active session already exists, a new Start opens the existing session.

### Acceptance criteria

- [ ] Session is not lost after force close/reopen.
- [ ] Duration after background is correct.
- [ ] The same active session appears on two screens.
- [ ] A second active event of the same type is not created by repeated Start.

---

## Phase 5 — Feed / Breast

### State machine

```text
idle
  → running(left)
  → running(right)
  → running(left)
  → completed

running → cancelled
```

### Start

```text
Feed
[ Breast ] [ Bottle ]

Start on
[ Left ] [ Right ]

[ Start Left side ]
```

### Active session

```text
Breastfeeding in progress

Total  16:24
Left   09m
Right  07m

[ Left ] [ Right ]
[ Finish feeding ]
```

### Step-by-step implementation

#### 5.1. Start

- [ ] User chooses the starting side.
- [ ] Create an active BreastFeedEvent.
- [ ] Create the first segment with `endedAt: null`.
- [ ] Save the event before showing the timer.
- [ ] Switch the Feed card into active state.

#### 5.2. Switch side

When switching `left → right`:

1. find the current open segment;
2. set its `endedAt = now`;
3. create a new `right` segment with `startedAt = now`;
4. recalculate totals through a selector;
5. save the update locally;
6. do not close the sheet and do not create a new event.

- [ ] Do not run the action if the user pressed the already active side.
- [ ] Protect side switch from double tap.

#### 5.3. Finish

- [ ] Close the last segment.
- [ ] Calculate `totalLeftMs` and `totalRightMs` from segments.
- [ ] Set `status = completed` and `endedAt = now`.
- [ ] Update last feed.
- [ ] Add a timeline item.
- [ ] Show Undo.

#### 5.4. Last side

Store the latest completed side. The UI can:

- show `Last side: Right`;
- suggest the opposite side as the default;
- never start it automatically.

### Acceptance criteria

- [ ] Start Left starts the timer.
- [ ] Switching Left → Right saves both durations.
- [ ] Multiple switches do not lose time.
- [ ] Force close and reopen restores the active side and totals.
- [ ] Finish creates one completed event.
- [ ] Cancel does not appear in the timeline as a completed feed.
- [ ] Feed card opens the active session if it is already running.

---

## Phase 6 — Sleep

### State machine

```text
idle → running → completed
       running → cancelled
idle → manualCompleted
```

### Idle UI

```text
Sleep

[ Start now ]
[ Started earlier ]

[ Add a completed sleep ]
```

For the first implementation, `Started earlier` can offer `5 min ago`, but the model and API must accept an arbitrary `startedAt` so a time picker can be added later without rewriting business logic.

### Active UI

```text
Sleep in progress

00:42:18
Started 14:10

[ Baby woke up ]
```

### Implementation

#### 6.1. Start now

- [ ] Check that there is no active sleep for the child.
- [ ] Create a SleepEvent with `status = active`.
- [ ] `startedAt = now`.
- [ ] Hero moves into night/active state.
- [ ] Quick Log subtitle becomes `Sleeping · 1m`.

#### 6.2. Started earlier

- [ ] Pass the selected timestamp to the same `startSleep()`.
- [ ] Do not create a separate business-logic branch.
- [ ] Validate that the time is not in the future.

#### 6.3. Finish

- [ ] `endedAt = now`.
- [ ] `status = completed`.
- [ ] Update timeline.
- [ ] Set wake window start to the completed sleep `endedAt`.
- [ ] Hero and Quick Log return to awake state.
- [ ] Show Undo.

#### 6.4. Completed sleep

- [ ] User chooses start/end or duration.
- [ ] A completed SleepEvent is created immediately.
- [ ] Do not start an active timer.

#### 6.5. Single source of truth

The following elements must read the same selector/action:

- Hero `Start sleep / Baby woke up`;
- Quick Log Sleep;
- Sleep bottom sheet;
- timeline active state;
- future lock-screen integration.

### Acceptance criteria

- [ ] Starting from Hero shows active state in Quick Log.
- [ ] Starting from Quick Log changes the Hero.
- [ ] Timer survives background and restart.
- [ ] `Started 5 min earlier` produces the correct final duration.
- [ ] It is impossible to accidentally create two active sleep sessions for one child.
- [ ] The app does not finish sleep automatically.
- [ ] Undo finish restores the active sleep session when it is still safe and the mutation has not been replaced by another action.

---

## Phase 7 — Pump

### State machine

```text
idle → running → volumeDraft → completed
       running → cancelled
volumeDraft → completedWithoutVolume
```

### Start UI

```text
Pump

[ Left ] [ Right ] [ Both ]

[ Start pumping ]
```

### Active UI

```text
Pumping in progress

18:24
Both

[ Finish pumping ]
```

### Volume draft

```text
Add pumped volume

Left   [ -5 ] 50 ml [ +5 ]
Right  [ -5 ] 60 ml [ +5 ]

[ Save pump · 110 ml ]
Save without volume
```

### Implementation

#### 7.1. Start

- [ ] Choose Left/Right/Both.
- [ ] Create an active PumpEvent.
- [ ] `subjectUserId = current caregiver`.
- [ ] Make `childId` optional according to the backend model.
- [ ] Quick Log card shows active state.

#### 7.2. Finish timer

- [ ] Set `endedAt` and duration.
- [ ] Do not create a completed event immediately.
- [ ] Move the session into `pumpVolumeDraft`.
- [ ] Draft must survive sheet close and app restart.

#### 7.3. Save volume

- [ ] For `left`, show only the left input.
- [ ] For `right`, show only the right input.
- [ ] For `both`, show two inputs/steppers.
- [ ] Calculate Total; do not store it as an independent field.
- [ ] Allow zero value only through a separate `Save without volume` action.
- [ ] After save, set `status = completed`.
- [ ] Update timeline and last pump.

### Acceptance criteria

- [ ] Timer survives restart.
- [ ] Finished draft is not lost if the sheet is closed.
- [ ] Both correctly sums left + right.
- [ ] Save without volume creates a valid duration-only record.
- [ ] Pump does not block active Sleep.
- [ ] Pump is tied to the caregiver, not incorrectly only to the child.

---

## Phase 8 — Timeline, edit, and Undo

### Timeline

- [ ] Sort by `occurredAt/startedAt` descending.
- [ ] Show active sessions separately or with an active badge.
- [ ] Show pending sync with a subtle indicator.
- [ ] Do not show soft-deleted events.
- [ ] Formatter must not contain business logic that changes data.

### Undo

```ts
interface UndoableMutation {
  mutationId: string;
  kind: 'create' | 'finish' | 'delete' | 'update';
  eventId: string;
  previousSnapshot: CareEvent | null;
  expiresAt: ISODateTime;
}
```

- [ ] Toast keeps a reference to a specific mutation.
- [ ] A new action replaces the previous Undo context.
- [ ] Undo create → soft delete created event.
- [ ] Undo finish → restore previous active snapshot if no new conflict appeared.
- [ ] Undo update → restore previous snapshot.
- [ ] Undo also enters the sync queue.

### Edit

For the first version, it is enough to support:

- [ ] changing time;
- [ ] changing bottle amount/milk type;
- [ ] changing diaper kind;
- [ ] changing pump volume;
- [ ] changing sleep start/end;
- [ ] soft delete.

Editing can be connected after the main flows, but the data model must support it from the start.

---

## Phase 9 — caregiver sync

If family sync already exists, adapt it to active sessions.

### Rules

- `clientEventId` is unique and stays the same on retry.
- The server stores `version`.
- Update sends the expected version.
- Do not silently overwrite on conflict.
- When opening activity, pull the latest server state first, then reconcile local pending state.

### Constraints

- One active sleep session per child.
- One active breastfeeding session per child.
- One active pump session per subjectUserId.

### Conflict UX

Example:

```text
Sleep was already started by Dad 3 min ago.

[ Open active sleep ]
```

For similar instant events:

```text
A similar diaper was logged by Dad 1 min ago.

[ Keep both ] [ Undo mine ]
```

Do not automatically delete possible duplicates.

---

## Phase 10 — accessibility and interaction safety

- [ ] All action buttons are `Pressable` or another accessible component with a label.
- [ ] Do not communicate event type by color only.
- [ ] Every button has text: `Wet diaper`, `Start left breast`, `Finish sleep`.
- [ ] Use `accessibilityRole="button"`.
- [ ] Do not update screen readers every second for an active timer; otherwise the interface will keep talking.
- [ ] Minimum touch area follows mobile platform guidance.
- [ ] During save, block repeated presses only for the short mutation phase.
- [ ] Visually separate active-session Cancel from Finish.
- [ ] Use confirmation for destructive cancel/delete when meaningful data loss is possible.
- [ ] Support Reduce Motion for decorative animations.

---

## Phase 11 — testing

## 11.1. Unit tests

Use a fake clock.

### Feed / Breast

- [ ] Start Left creates one open left segment.
- [ ] After 5 minutes, switch Right closes the left segment.
- [ ] After 3 more minutes, finish gives Left 5m / Right 3m.
- [ ] Multiple switches sum correctly.
- [ ] Hydration restores the active side.

### Feed / Bottle

- [ ] amount 120 + breast milk creates the correct payload.
- [ ] amount 0 is not saved.
- [ ] Double save creates one clientEventId.

### Sleep

- [ ] Start now → finish after 40 minutes.
- [ ] Start 5 minutes earlier → finish after 20 minutes = 25 minutes.
- [ ] Second start returns the existing active session.
- [ ] `endedAt` before `startedAt` is rejected.

### Diaper

- [ ] Each kind creates the correct event.
- [ ] Undo soft deletes the created event.
- [ ] Double press does not create a duplicate.

### Pump

- [ ] Both + 50/60 ml gives total 110 ml in the selector.
- [ ] Save without volume stores null volumes and duration.
- [ ] Volume draft restores after hydration.

## 11.2. Integration tests

- [ ] Repository create → store update → timeline render.
- [ ] Offline create → pending → reconnect → synced.
- [ ] Finish session → app restart → completed event remains.
- [ ] AppState background/active → timer recalculates.
- [ ] Legacy event is displayed correctly through the mapper.

## 11.3. E2E scenarios

1. Log Wet diaper in two taps and press Undo.
2. Save Bottle 90 ml without opening the keyboard.
3. Start breastfeeding Left, close the sheet, open it again, switch Right, finish.
4. Start Sleep from Hero, close the app, open it, and finish from Quick Log.
5. Start Pump Both, finish, close the sheet, restore the volume draft, and save 110 ml.
6. Perform an instant log offline, restart the app, turn the network on, and get sync.
7. Check two caregiver devices for an active sleep conflict.

---

## 12. Analytics for evaluating the new UX

Do not send sensitive notes, real volumes, or medical details to analytics.

Minimum events:

```text
logging_chooser_opened
logging_flow_opened
logging_session_started
logging_session_resumed
logging_side_switched
logging_session_finished
logging_session_cancelled
logging_instant_saved
logging_undo_used
logging_validation_failed
logging_sync_failed
logging_conflict_detected
```

Parameters:

```ts
{
  type: 'feed' | 'sleep' | 'diaper' | 'pump',
  subtype?: string,
  entryPoint: 'quick_log' | 'hero' | 'global_log' | 'timeline',
  tapCount?: number,
  completionTimeBucket?: string,
  wasOffline?: boolean,
}
```

Main product metrics:

- median time from opening flow to save;
- median number of taps;
- abandoned flow rate;
- unfinished timer rate;
- Undo rate;
- edit-within-2-minutes rate;
- duplicate/conflict rate;
- percentage of sessions recovered after app restart.

---

## 13. Recommended PR order

### PR 1 — contracts

- [ ] Domain types
- [ ] Clock
- [ ] Repository interface
- [ ] Feature flag
- [ ] Legacy mapper skeleton

### PR 2 — local event pipeline

- [ ] Repository implementation
- [ ] Store hydration
- [ ] Timeline selectors
- [ ] Sync status
- [ ] Unit tests

### PR 3 — Diaper

- [ ] Two-tap flow
- [ ] Optimistic save
- [ ] Undo
- [ ] Accessibility

### PR 4 — Bottle

- [ ] Feed tabs
- [ ] Presets/stepper
- [ ] Milk type
- [ ] Validation

### PR 5 — session engine

- [ ] Active session persistence
- [ ] Timer hook
- [ ] AppState recovery
- [ ] Conflict guards

### PR 6 — Breastfeeding

- [ ] Start side
- [ ] Segments
- [ ] Switch side
- [ ] Finish/cancel

### PR 7 — Sleep

- [ ] Start now/earlier
- [ ] Hero integration
- [ ] Finish/manual completed sleep

### PR 8 — Pump

- [ ] Start side
- [ ] Active timer
- [ ] Persistent volume draft
- [ ] Optional volume

### PR 9 — sync and migration

- [ ] Idempotency
- [ ] Version conflicts
- [ ] Legacy data migration
- [ ] Test-family rollout

### PR 10 — hardening

- [ ] E2E
- [ ] Analytics
- [ ] Accessibility audit
- [ ] Error states
- [ ] Production rollout flag

---

## 14. Definition of Done

The functionality is ready when:

- [ ] All four cards use separate purpose-built flows.
- [ ] Diaper is logged in two taps.
- [ ] Bottle is logged without a required keyboard.
- [ ] Breastfeeding correctly calculates Left/Right after multiple switches.
- [ ] Sleep is controlled consistently from Hero and Quick Log.
- [ ] Pump saves duration and optional volume.
- [ ] Active timers survive background and full restart.
- [ ] Events appear in the timeline immediately.
- [ ] Undo works for the latest mutation.
- [ ] Offline logging does not lose data.
- [ ] Retry does not create duplicate events.
- [ ] Old MVP data is displayed correctly.
- [ ] Unit, integration, and core E2E tests pass.
- [ ] The feature can be enabled/disabled through a feature flag without reinstalling the app.

---

## 15. What is not included in this plan yet

Do not include in the first refactor:

- sleep prediction;
- AI insights;
- Live Activities and widgets;
- voice logging;
- milk stash;
- detailed medical diaper fields;
- charts and weekly analytics;
- reminders;
- export for doctor/pediatrician.

First, the four core logging flows must become reliable.

---

## 16. First practical step in the codebase

Do not start with the Feed UI. Start with this vertical slice:

```text
CareEvent types
→ LoggingRepository
→ local create
→ LoggingStore
→ Diaper two-tap UI
→ Timeline
→ Undo
→ restart recovery
```

Once Diaper fully passes this path, the architecture is ready for Bottle. After Bottle, add the Session Engine, then build Breastfeeding, Sleep, and Pump on top of it one by one.

---

## Reference docs

- [React Native AppState](https://reactnative.dev/docs/appstate)
- [React Native Accessibility](https://reactnative.dev/docs/accessibility)
- [React Native Testing Overview](https://reactnative.dev/docs/testing-overview)
- [React Native Pressable](https://reactnative.dev/docs/pressable)
- [AsyncStorage documentation](https://react-native-async-storage.github.io/)
