/**
 * Closes the last open segment, recalculates totals, and marks the session completed.
 * Pure function — returns an updated BreastFeedEvent. Caller passes to store.finishSession().
 */
import type { BreastFeedEvent, ISODateTime } from '../domain/types';
import { validateBreastSegments } from '../domain/types';
import { calcBreastSegmentTotals } from '../timer/sessionMath';

interface FinishBreastFeedParams {
  event: BreastFeedEvent;
  endedAt: ISODateTime;
}

export function buildFinishBreastFeedEvent(params: FinishBreastFeedParams): BreastFeedEvent {
  const { event, endedAt } = params;
  const nowMs = new Date(endedAt).getTime();

  const segments = event.details.segments.map((seg) =>
    seg.endedAt === null ? { ...seg, endedAt } : seg,
  );

  validateBreastSegments(segments);

  const { totalLeftMs, totalRightMs } = calcBreastSegmentTotals(segments, nowMs);

  return {
    ...event,
    status: 'completed',
    endedAt,
    updatedAt: endedAt,
    version: event.version + 1,
    details: { activeSide: null, segments, totalLeftMs, totalRightMs },
  };
}
