/**
 * Logging v2 — finish a breastfeeding session (plan Phase 5.3 / §13 PR6).
 *
 * Closes the last open segment at `now`, recomputes `totalLeftMs`/`totalRightMs`
 * from the (now fully closed) segments, and marks the event `completed` with
 * `endedAt = now` and `activeSide = null`. The session range and segment chain
 * are validated before the write so an invalid range surfaces a recover/error
 * state instead of persisting (plan §6).
 */
import { validateBreastSegments, validateSessionRange } from '../domain/rules';
import type { BreastFeedEvent, BreastSideSegment, ISODateTime } from '../domain/types';
import { breastSegmentTotals } from '../timer/sessionMath';
import type { LoggingUseCaseDeps, UseCaseResult } from './types';

export interface FinishBreastFeedInput {
  event: BreastFeedEvent;
  /** When feeding ended; defaults to now. */
  at?: ISODateTime;
}

export async function finishBreastFeed(
  deps: LoggingUseCaseDeps,
  input: FinishBreastFeedInput,
): Promise<UseCaseResult<BreastFeedEvent>> {
  const { repo, clock } = deps;
  const { event } = input;
  const at = input.at ?? clock.nowIso();

  const segments: BreastSideSegment[] = event.details.segments.map((seg) =>
    seg.endedAt === null ? { ...seg, endedAt: at } : seg,
  );

  const segCheck = validateBreastSegments(segments);
  if (!segCheck.ok) return segCheck;
  const rangeCheck = validateSessionRange(event.startedAt ?? at, at, clock.now());
  if (!rangeCheck.ok) return rangeCheck;

  const totals = breastSegmentTotals(segments, clock.now());
  const next: BreastFeedEvent = {
    ...event,
    status: 'completed',
    endedAt: at,
    details: { activeSide: null, segments, ...totals },
  };

  await repo.updateEvent(next);
  await repo.enqueueSync(next.id);
  return { ok: true, event: next };
}

/** A finished session's display total (left + right), recomputed from segments. */
export function breastFeedTotalMs(event: BreastFeedEvent, now: number): number {
  const { totalLeftMs, totalRightMs } = breastSegmentTotals(event.details.segments, now);
  return totalLeftMs + totalRightMs;
}
