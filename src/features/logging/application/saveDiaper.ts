/**
 * Builds a completed DiaperEvent for an instant diaper log.
 * Pure function — caller passes result to store.createEvent().
 */
import type { DiaperEvent, ISODateTime } from '../domain/types';
import { validateDiaperKind } from '../domain/types';
import { makeId } from './makeId';

type DiaperKind = 'wet' | 'dirty' | 'both' | 'dry';

interface SaveDiaperParams {
  familyId: string;
  childId: string;
  createdByUserId: string;
  kind: DiaperKind;
  occurredAt: ISODateTime;
}

export function buildSaveDiaperEvent(params: SaveDiaperParams): DiaperEvent {
  const { familyId, childId, createdByUserId, kind, occurredAt } = params;
  validateDiaperKind(kind);
  const tzOffset = new Date().getTimezoneOffset();

  return {
    id: makeId(),
    clientEventId: makeId(),
    familyId,
    childId,
    createdByUserId,
    type: 'diaper',
    status: 'completed',
    occurredAt,
    startedAt: null,
    endedAt: null,
    timezoneOffsetMinutes: tzOffset,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    syncStatus: 'local',
    version: 1,
    details: { kind },
  };
}
