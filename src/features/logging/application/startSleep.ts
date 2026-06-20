/**
 * Builds an active SleepEvent.
 * Pure function — no I/O. Caller passes the result to store.startSession().
 */
import type { SleepEvent, ISODateTime } from '../domain/types';
import { makeId } from './makeId';

interface StartSleepParams {
  familyId: string;
  childId: string;
  createdByUserId: string;
  /** ISO timestamp for when sleep started. Defaults to now when not provided. */
  startedAt: ISODateTime;
}

export function buildStartSleepEvent(params: StartSleepParams): SleepEvent {
  const { familyId, childId, createdByUserId, startedAt } = params;
  const tzOffset = new Date().getTimezoneOffset();

  return {
    id: makeId(),
    clientEventId: makeId(),
    familyId,
    childId,
    createdByUserId,
    type: 'sleep',
    status: 'active',
    occurredAt: startedAt,
    startedAt,
    endedAt: null,
    timezoneOffsetMinutes: tzOffset,
    createdAt: startedAt,
    updatedAt: startedAt,
    syncStatus: 'local',
    version: 1,
    details: {
      sleepType: 'unknown',
    },
  };
}
