/**
 * Closes the current open breast segment and opens a new one for the given side.
 * Pure function — returns an updated BreastFeedEvent. No-ops if already on that side.
 */
import type { BreastFeedEvent, ISODateTime } from '../domain/types';
import { calcBreastSegmentTotals } from '../timer/sessionMath';
import { makeId } from './makeId';

interface SwitchBreastSideParams {
  event: BreastFeedEvent;
  newSide: 'left' | 'right';
  nowIso: ISODateTime;
}

export function buildSwitchBreastSideEvent(params: SwitchBreastSideParams): BreastFeedEvent {
  const { event, newSide, nowIso } = params;

  if (event.details.activeSide === newSide) return event;

  const nowMs = new Date(nowIso).getTime();

  const closedSegments = event.details.segments.map((seg) =>
    seg.endedAt === null ? { ...seg, endedAt: nowIso } : seg,
  );

  const segments = [...closedSegments, { id: makeId(), side: newSide, startedAt: nowIso, endedAt: null }];
  const { totalLeftMs, totalRightMs } = calcBreastSegmentTotals(segments, nowMs);

  return {
    ...event,
    updatedAt: nowIso,
    version: event.version + 1,
    details: { activeSide: newSide, segments, totalLeftMs, totalRightMs },
  };
}
