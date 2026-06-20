/**
 * Builds a completed BottleFeedEvent for an instant bottle log.
 * Pure function — caller passes result to store.createEvent().
 */
import type { BottleFeedEvent, ISODateTime, MilkType } from '../domain/types';
import { validateBottleAmount } from '../domain/types';
import { makeId } from './makeId';

interface SaveBottleFeedParams {
  familyId: string;
  childId: string;
  createdByUserId: string;
  amountMl: number;
  milkType: MilkType;
  occurredAt: ISODateTime;
}

export function buildSaveBottleFeedEvent(params: SaveBottleFeedParams): BottleFeedEvent {
  const { familyId, childId, createdByUserId, amountMl, milkType, occurredAt } = params;
  validateBottleAmount(amountMl);
  const tzOffset = new Date().getTimezoneOffset();

  return {
    id: makeId(),
    clientEventId: makeId(),
    familyId,
    childId,
    createdByUserId,
    type: 'feed',
    method: 'bottle',
    status: 'completed',
    occurredAt,
    startedAt: null,
    endedAt: null,
    timezoneOffsetMinutes: tzOffset,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    syncStatus: 'local',
    version: 1,
    details: { amountMl, milkType },
  };
}
