/**
 * Logging v2 — start a breastfeeding session (plan Phase 5.1 / §13 PR6).
 *
 * Creates an ACTIVE `BreastFeedEvent` with a single open segment on the chosen
 * starting side and `activeSide` set. The event is saved BEFORE the timer UI
 * shows (plan Phase 4 / 5.1), so a force-close right after Start still recovers
 * the session.
 *
 * Session guard (plan Phase 4): only one active breastfeeding session per child.
 * If one already exists, Start RETURNS it (`resumed: true`) instead of creating a
 * second — pressing Start again just reopens the running session.
 */
import { validateSessionRange } from '../domain/rules';
import type { BreastFeedEvent, BreastSide, BreastSideSegment, ISODateTime } from '../domain/types';
import { newUuid } from '../domain/ids';
import { selectActiveBreastFeed } from '../state/loggingSelectors';
import { newCareEventBase, type LoggingUseCaseDeps, type UseCaseResult } from './types';

export interface StartBreastFeedInput {
  side: BreastSide;
  /** Backdated start (e.g. "started earlier"); defaults to now. Must not be future. */
  startedAt?: ISODateTime;
  clientEventId?: string;
}

export async function startBreastFeed(
  deps: LoggingUseCaseDeps,
  input: StartBreastFeedInput,
): Promise<UseCaseResult<BreastFeedEvent>> {
  const { repo, clock, actor } = deps;

  // One active breastfeeding session per child: reopen the existing one.
  const active = await repo.getActiveSessions({
    familyId: actor.familyId,
    childId: actor.childId,
    userId: actor.userId,
  });
  const existing = selectActiveBreastFeed(active);
  if (existing) return { ok: true, event: existing, resumed: true };

  const startedAt = input.startedAt ?? clock.nowIso();
  const rangeCheck = validateSessionRange(startedAt, null, clock.now());
  if (!rangeCheck.ok) return rangeCheck;

  const segment: BreastSideSegment = {
    id: newUuid(),
    side: input.side,
    startedAt,
    endedAt: null,
  };
  const base = newCareEventBase(actor, clock, {
    clientEventId: input.clientEventId,
    occurredAt: startedAt,
    startedAt,
    endedAt: null,
    status: 'active',
  });
  const event: BreastFeedEvent = {
    ...base,
    type: 'feed',
    childId: actor.childId,
    status: 'active',
    method: 'breast',
    details: { activeSide: input.side, segments: [segment], totalLeftMs: 0, totalRightMs: 0 },
  };

  await repo.createEvent(event);
  await repo.enqueueSync(event.id);
  return { ok: true, event };
}
