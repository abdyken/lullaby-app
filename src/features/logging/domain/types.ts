/**
 * Unified care event model for the Lullaby logging system (v2).
 *
 * Discriminated union over four core logging types: feed, sleep, diaper, pump.
 * The legacy LogEvent (src/data/models.ts) is kept intact; this lives alongside
 * it and will be bridged via LegacyLoggingMapper in a later task.
 */

// ─── Primitives ───────────────────────────────────────────────────────────────

export type ISODateTime = string;

/** Per-event sync lifecycle. */
export type SyncStatus = 'local' | 'pending' | 'synced' | 'failed';

// ─── Clock abstraction ────────────────────────────────────────────────────────

export interface Clock {
  now(): number;
  nowIso(): ISODateTime;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};

// ─── Base event ───────────────────────────────────────────────────────────────

export interface CareEventBase {
  id: string;
  /** Stable idempotency key set by the client — never changes on retry. */
  clientEventId: string;
  familyId: string;
  childId: string | null;
  createdByUserId: string;

  type: 'feed' | 'sleep' | 'diaper' | 'pump';
  status: 'active' | 'completed' | 'cancelled' | 'deleted';

  /** When the event logically happened (instant events) or started. */
  occurredAt: ISODateTime;
  startedAt: ISODateTime | null;
  endedAt: ISODateTime | null;

  timezoneOffsetMinutes: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;

  syncStatus: SyncStatus;
  version: number;
}

// ─── Feed — Breast ────────────────────────────────────────────────────────────

export interface BreastSideSegment {
  id: string;
  side: 'left' | 'right';
  startedAt: ISODateTime;
  /** null while this segment is still active. */
  endedAt: ISODateTime | null;
}

export interface BreastFeedEvent extends CareEventBase {
  type: 'feed';
  childId: string;
  method: 'breast';
  details: {
    activeSide: 'left' | 'right' | null;
    segments: BreastSideSegment[];
    /** Cumulative left-side duration in milliseconds (derived, stored for quick read). */
    totalLeftMs: number;
    /** Cumulative right-side duration in milliseconds (derived, stored for quick read). */
    totalRightMs: number;
  };
}

// ─── Feed — Bottle ────────────────────────────────────────────────────────────

export type MilkType = 'breast_milk' | 'formula' | 'mixed' | 'other';

export interface BottleFeedEvent extends CareEventBase {
  type: 'feed';
  childId: string;
  method: 'bottle';
  status: 'completed' | 'deleted';
  details: {
    amountMl: number;
    milkType: MilkType;
  };
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

export interface SleepEvent extends CareEventBase {
  type: 'sleep';
  childId: string;
  details: {
    sleepType: 'nap' | 'night' | 'unknown';
  };
}

// ─── Diaper ───────────────────────────────────────────────────────────────────

export type DiaperKind = 'wet' | 'dirty' | 'both' | 'dry';

export interface DiaperEvent extends CareEventBase {
  type: 'diaper';
  childId: string;
  status: 'completed' | 'deleted';
  details: {
    kind: DiaperKind;
    rash?: boolean;
    note?: string;
  };
}

// ─── Pump ─────────────────────────────────────────────────────────────────────

export type PumpSide = 'left' | 'right' | 'both';

export interface PumpEvent extends CareEventBase {
  type: 'pump';
  /** childId is optional — pump belongs to the caregiver first. */
  childId: string | null;
  /** The caregiver who is pumping. */
  subjectUserId: string;
  details: {
    side: PumpSide;
    leftVolumeMl: number | null;
    rightVolumeMl: number | null;
  };
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type CareEvent =
  | BreastFeedEvent
  | BottleFeedEvent
  | SleepEvent
  | DiaperEvent
  | PumpEvent;

// ─── Undo ─────────────────────────────────────────────────────────────────────

export interface UndoableMutation {
  mutationId: string;
  kind: 'create' | 'finish' | 'delete' | 'update';
  eventId: string;
  previousSnapshot: CareEvent | null;
  expiresAt: ISODateTime;
  /** User-facing label shown in the Undo toast, e.g. "Wet diaper logged". */
  label: string;
}

// ─── Pump volume draft (survives sheet close / restart) ───────────────────────

export interface PumpVolumeDraft {
  eventId: string;
  side: PumpSide;
  leftVolumeMl: number;
  rightVolumeMl: number;
}

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateBottleAmount(amountMl: number): void {
  if (amountMl <= 0) {
    throw new Error('Bottle amount must be greater than 0 ml.');
  }
}

export function validateSessionRange(
  startedAt: ISODateTime | null,
  endedAt: ISODateTime | null,
): void {
  if (!startedAt || !endedAt) return;
  if (new Date(endedAt).getTime() < new Date(startedAt).getTime()) {
    throw new Error('endedAt must not be before startedAt.');
  }
}

export function validateBreastSegments(segments: BreastSideSegment[]): void {
  for (const seg of segments) {
    if (seg.endedAt !== null) {
      validateSessionRange(seg.startedAt, seg.endedAt);
    }
  }
}

export function validatePumpVolumes(details: PumpEvent['details']): void {
  const { side, leftVolumeMl, rightVolumeMl } = details;
  if (side === 'left' && leftVolumeMl !== null && leftVolumeMl < 0) {
    throw new Error('Left pump volume cannot be negative.');
  }
  if (side === 'right' && rightVolumeMl !== null && rightVolumeMl < 0) {
    throw new Error('Right pump volume cannot be negative.');
  }
  if (side === 'both') {
    if (leftVolumeMl !== null && leftVolumeMl < 0) {
      throw new Error('Left pump volume cannot be negative.');
    }
    if (rightVolumeMl !== null && rightVolumeMl < 0) {
      throw new Error('Right pump volume cannot be negative.');
    }
  }
}

export function validateDiaperKind(kind: unknown): asserts kind is DiaperKind {
  const valid: DiaperKind[] = ['wet', 'dirty', 'both', 'dry'];
  if (!valid.includes(kind as DiaperKind)) {
    throw new Error(`Invalid diaper kind: ${String(kind)}.`);
  }
}
