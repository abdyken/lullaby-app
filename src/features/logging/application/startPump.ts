/**
 * Builds an active PumpEvent.
 * Pure function — no I/O. Caller passes the result to store.startSession().
 */
import type { PumpEvent, ISODateTime, PumpSide } from '../domain/types';
import { makeId } from './makeId';

interface StartPumpParams {
  familyId: string;
  childId: string | null;
  createdByUserId: string;
  /** The caregiver who is pumping (may differ from createdByUserId in multi-user families). */
  subjectUserId: string;
  side: PumpSide;
  startedAt: ISODateTime;
}

export function buildStartPumpEvent(params: StartPumpParams): PumpEvent {
  const { familyId, childId, createdByUserId, subjectUserId, side, startedAt } = params;
  const tzOffset = new Date().getTimezoneOffset();

  return {
    id: makeId(),
    clientEventId: makeId(),
    familyId,
    childId,
    createdByUserId,
    subjectUserId,
    type: 'pump',
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
      side,
      leftVolumeMl: null,
      rightVolumeMl: null,
    },
  };
}
