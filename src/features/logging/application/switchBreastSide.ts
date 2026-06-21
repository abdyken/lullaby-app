/**
 * Logging v2 — switch sides mid-breastfeed (plan Phase 5.2 / §13 PR6).
 *
 * Closes the current open segment at `now` and opens a new one on the other side
 * at the same instant, then recomputes the per-side totals from the segments
 * (never mutating only `leftMs/rightMs` — segments are the source of truth, plan
 * §4.1). It does NOT finish the session or create a new event.
 *
 * Pressing the side that is already active is ignored (`noop: true`, plan §5.2)
 * so a double-tap can't split a segment into two zero-length ones.
 */
import { validateBreastSegments } from '../domain/rules';
import type { BreastFeedEvent, BreastSide, BreastSideSegment, ISODateTime } from '../domain/types';
import { newUuid } from '../domain/ids';
import { breastSegmentTotals } from '../timer/sessionMath';
import type { LoggingUseCaseDeps, UseCaseResult } from './types';

export interface SwitchBreastSideInput {
  event: BreastFeedEvent;
  side: BreastSide;
  /** When the switch happens; defaults to now. */
  at?: ISODateTime;
}

export async function switchBreastSide(
  deps: LoggingUseCaseDeps,
  input: SwitchBreastSideInput,
): Promise<UseCaseResult<BreastFeedEvent>> {
  const { repo, clock } = deps;
  const { event, side } = input;

  // Already on this side → ignore (protects against double-tap, plan §5.2).
  if (event.details.activeSide === side) return { ok: true, event, noop: true };

  const at = input.at ?? clock.nowIso();
  // Close the open segment, then append the new open one on the chosen side.
  const closed: BreastSideSegment[] = event.details.segments.map((seg) =>
    seg.endedAt === null ? { ...seg, endedAt: at } : seg,
  );
  const segments: BreastSideSegment[] = [
    ...closed,
    { id: newUuid(), side, startedAt: at, endedAt: null },
  ];

  const segCheck = validateBreastSegments(segments);
  if (!segCheck.ok) return segCheck;

  const totals = breastSegmentTotals(segments, clock.now());
  const next: BreastFeedEvent = {
    ...event,
    details: { activeSide: side, segments, ...totals },
  };

  await repo.updateEvent(next);
  await repo.enqueueSync(next.id);
  return { ok: true, event: next };
}
