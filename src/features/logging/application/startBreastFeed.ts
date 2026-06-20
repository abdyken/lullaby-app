/**
 * Builds an active BreastFeedEvent with the first side segment.
 * Pure function — no I/O. Caller passes the result to store.startSession().
 */
import type { BreastFeedEvent, ISODateTime } from '../domain/types';
import { makeId } from './makeId';

interface StartBreastFeedParams {
  familyId: string;
  childId: string;
  createdByUserId: string;
  side: 'left' | 'right';
  startedAt: ISODateTime;
}

export function buildStartBreastFeedEvent(params: StartBreastFeedParams): BreastFeedEvent {
  const { familyId, childId, createdByUserId, side, startedAt } = params;
  const tzOffset = new Date().getTimezoneOffset();

  return {
    id: makeId(),
    clientEventId: makeId(),
    familyId,
    childId,
    createdByUserId,
    type: 'feed',
    method: 'breast',
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
      activeSide: side,
      segments: [{ id: makeId(), side, startedAt, endedAt: null }],
      totalLeftMs: 0,
      totalRightMs: 0,
    },
  };
}
