/**
 * Logging v2 — session selectors (plan §1.3 store, §4 session rules).
 *
 * Pure derivations over a `CareEvent[]`: which session of each kind is currently
 * active. The session rules are encoded here so the store and UI never hand-check
 * `type`/`status`:
 *   - one active sleep per child;
 *   - one active breastfeeding session per child;
 *   - one active pump per caregiver (`subjectUserId`) — pump belongs to the
 *     caregiver, not the child (plan §4.4), so it is scoped by user, not child.
 *
 * No React, no I/O — runnable under the Node smoke test.
 */
import {
  isBreastFeed,
  isPumpEvent,
  isSleepEvent,
  type BreastFeedEvent,
  type CareEvent,
  type ISODateTime,
  type PumpEvent,
  type PumpVolumeDraft,
  type SleepEvent,
} from '../domain/types';
import { sessionElapsedMs } from '../timer/sessionMath';
import type { LoggingState } from './loggingStore';

/** The active breastfeeding session in a list, if any. */
export function selectActiveBreastFeed(events: CareEvent[]): BreastFeedEvent | null {
  for (const event of events) {
    if (isBreastFeed(event) && event.status === 'active') return event;
  }
  return null;
}

/** The active sleep session in a list, if any. */
export function selectActiveSleep(events: CareEvent[]): SleepEvent | null {
  for (const event of events) {
    if (isSleepEvent(event) && event.status === 'active') return event;
  }
  return null;
}

/**
 * The active pump session, scoped to a caregiver. With `subjectUserId` omitted,
 * returns the first active pump regardless of owner (used when the list is
 * already caregiver-scoped, e.g. straight from `getActiveSessions`).
 */
export function selectActivePump(
  events: CareEvent[],
  subjectUserId?: string,
): PumpEvent | null {
  for (const event of events) {
    if (
      isPumpEvent(event) &&
      event.status === 'active' &&
      (subjectUserId === undefined || event.subjectUserId === subjectUserId)
    ) {
      return event;
    }
  }
  return null;
}

/**
 * Whether a pump has finished its timer but not yet been saved (an active pump
 * with an `endedAt` set). The store turns such an event into a `pumpVolumeDraft`;
 * a running pump (`endedAt === null`) is not a draft (plan Phase 7.2).
 */
export function isPumpVolumeDraft(event: PumpEvent | null): boolean {
  return event !== null && event.endedAt !== null;
}

/**
 * The persisted volume-draft view of a finished-but-unsaved pump (plan §7.2 /
 * §4.5 `PumpVolumeDraft`). Self-contained so the draft survives a sheet close
 * and a restart: it carries everything the volume step needs without holding a
 * reference to live store state. Volumes are whatever the event has so far
 * (null right after finish).
 */
export function pumpEventToVolumeDraft(event: PumpEvent): PumpVolumeDraft {
  return {
    eventId: event.id,
    clientEventId: event.clientEventId,
    side: event.details.side,
    startedAt: event.startedAt as ISODateTime,
    endedAt: event.endedAt as ISODateTime,
    leftVolumeMl: event.details.leftVolumeMl,
    rightVolumeMl: event.details.rightVolumeMl,
  };
}

/**
 * Total pumped volume in ml — derived, NEVER stored (plan §7.3 "calculate Total;
 * do not store it as an independent field"). A `null` side counts as 0, so a
 * "save without volume" record totals 0.
 */
export function pumpTotalVolumeMl(details: PumpEvent['details']): number {
  return (details.leftVolumeMl ?? 0) + (details.rightVolumeMl ?? 0);
}

/** Whether any session (sleep, breast, or pump) is currently running. */
export function selectIsAnySessionActive(state: LoggingState): boolean {
  return Boolean(state.activeSleep || state.activeBreastFeed || state.activePump);
}

/** Elapsed milliseconds of a session (or 0 when there is none), recomputed from `now`. */
export function selectSessionElapsedMs(event: CareEvent | null, now: number): number {
  return event === null ? 0 : sessionElapsedMs(event, now);
}
