/**
 * Logging v2 — shared event model (plan §4).
 *
 * A discriminated `CareEvent` union: one shared timeline, a separately validated
 * payload per feature (Feed / Sleep / Diaper / Pump). This lives BESIDE the
 * existing flat `LogEvent` (src/data/models.ts); the old MVP keeps working while
 * the new logging domain is built up behind a `loggingV2` flag and a
 * `LegacyLoggingMapper` (added in later tasks). Nothing here is wired into the
 * running app yet — it is the foundation the repository, store, and flows sit on.
 *
 * Source of truth: docs/LULLABY_LOGGING_IMPLEMENTATION_PLAN_EN.md §4.
 */

/** ISO-8601 timestamp, e.g. "2026-06-21T03:16:00.000Z". */
export type ISODateTime = string;

/** Where a locally-created event sits relative to the backend. */
export type SyncStatus = 'local' | 'pending' | 'synced' | 'failed';

/** The four core logging functions. `note` stays on the legacy model, out of scope. */
export type CareEventType = 'feed' | 'sleep' | 'diaper' | 'pump';

/** Lifecycle of an event. Instant events are `completed`; sessions start `active`. */
export type CareEventStatus = 'active' | 'completed' | 'cancelled' | 'deleted';

export type BreastSide = 'left' | 'right';
export type PumpSide = 'left' | 'right' | 'both';
export type MilkType = 'breast_milk' | 'formula' | 'mixed' | 'other';
export type DiaperKind = 'wet' | 'dirty' | 'both' | 'dry';
export type SleepType = 'nap' | 'night' | 'unknown';

/** Fields shared by every `CareEvent`, regardless of type. */
export interface CareEventBase {
  id: string;
  /** Idempotency key — stable across retries so sync never duplicates (plan §9). */
  clientEventId: string;
  familyId: string;
  /** Null only for caregiver-owned events (pump); per-baby events set it. */
  childId: string | null;
  createdByUserId: string;

  type: CareEventType;
  status: CareEventStatus;

  /** When the event "happened" for timeline ordering. Instant events use this. */
  occurredAt: ISODateTime;
  /** Session start; null for pure instant events. */
  startedAt: ISODateTime | null;
  /** Session end; null while active or for instant events. */
  endedAt: ISODateTime | null;

  timezoneOffsetMinutes: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;

  syncStatus: SyncStatus;
  /** Optimistic-concurrency version (plan §9). Bumped on every update. */
  version: number;
}

/* ----------------------------- Feed ----------------------------- */

/**
 * One continuous nursing stretch on a single side. Storing segments (instead of
 * mutating only `leftMs`/`rightMs`) preserves the switch history so an active
 * session can be restored exactly after a restart (plan §4.1).
 */
export interface BreastSideSegment {
  id: string;
  side: BreastSide;
  startedAt: ISODateTime;
  /** null while this segment is the open/active one. */
  endedAt: ISODateTime | null;
}

export interface BreastFeedEvent extends CareEventBase {
  type: 'feed';
  childId: string;
  method: 'breast';
  details: {
    activeSide: BreastSide | null;
    segments: BreastSideSegment[];
    totalLeftMs: number;
    totalRightMs: number;
  };
}

export interface BottleFeedEvent extends CareEventBase {
  type: 'feed';
  childId: string;
  /** Bottle is an instant quantity event — never `active`. */
  status: 'completed' | 'deleted';
  method: 'bottle';
  details: {
    amountMl: number;
    milkType: MilkType;
  };
}

export type FeedEvent = BreastFeedEvent | BottleFeedEvent;

/* ----------------------------- Sleep ----------------------------- */

export interface SleepEvent extends CareEventBase {
  type: 'sleep';
  childId: string;
  details: {
    sleepType: SleepType;
  };
}

/* ----------------------------- Diaper ---------------------------- */

export interface DiaperEvent extends CareEventBase {
  type: 'diaper';
  childId: string;
  /** Instant event — never `active`. */
  status: 'completed' | 'deleted';
  details: {
    kind: DiaperKind;
    /** Optional advanced detail — never shown in the quick-log path (plan §4.3). */
    rash?: boolean;
    note?: string;
  };
}

/* ----------------------------- Pump ------------------------------ */

/**
 * Pump belongs to the nursing/pumping caregiver first, not the baby, so
 * `childId` may be null and `subjectUserId` identifies the caregiver (plan §4.4).
 */
export interface PumpEvent extends CareEventBase {
  type: 'pump';
  childId: string | null;
  subjectUserId: string;
  details: {
    side: PumpSide;
    leftVolumeMl: number | null;
    rightVolumeMl: number | null;
  };
}

/* ----------------------------- Union ----------------------------- */

export type CareEvent =
  | BreastFeedEvent
  | BottleFeedEvent
  | SleepEvent
  | DiaperEvent
  | PumpEvent;

/* --------------------------- Drafts / undo ----------------------- */

/**
 * A finished pump session waiting for its (optional) volume. Must survive sheet
 * close and app restart (plan Phase 7.2), so it is a persisted draft, not local
 * component state.
 */
export interface PumpVolumeDraft {
  eventId: string;
  clientEventId: string;
  side: PumpSide;
  startedAt: ISODateTime;
  endedAt: ISODateTime;
  leftVolumeMl: number | null;
  rightVolumeMl: number | null;
}

/**
 * Snapshot backing a single Undo (plan §8). A new mutation replaces the previous
 * undo context; `previousSnapshot` lets undo-finish/undo-update restore state.
 */
export interface UndoableMutation {
  mutationId: string;
  kind: 'create' | 'finish' | 'delete' | 'update';
  eventId: string;
  previousSnapshot: CareEvent | null;
  expiresAt: ISODateTime;
}

/* --------------------------- Type guards ------------------------- */
// Narrow a `CareEvent` to its concrete shape. Used by selectors, the timeline
// formatter, and validators so callers don't hand-check `type`/`method`.

export const isFeedEvent = (e: CareEvent): e is FeedEvent => e.type === 'feed';

export const isBreastFeed = (e: CareEvent): e is BreastFeedEvent =>
  e.type === 'feed' && e.method === 'breast';

export const isBottleFeed = (e: CareEvent): e is BottleFeedEvent =>
  e.type === 'feed' && e.method === 'bottle';

export const isSleepEvent = (e: CareEvent): e is SleepEvent => e.type === 'sleep';

export const isDiaperEvent = (e: CareEvent): e is DiaperEvent => e.type === 'diaper';

export const isPumpEvent = (e: CareEvent): e is PumpEvent => e.type === 'pump';

/** An active session (sleep / breast / pump still running). */
export const isActiveSession = (e: CareEvent): boolean => e.status === 'active';
