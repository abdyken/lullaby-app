/**
 * Logging v2 — start a sleep session (plan Phase 6.1 / 6.2, §13 PR7).
 *
 * Creates an ACTIVE `SleepEvent` with `startedAt` (now, or a backdated "started
 * earlier" timestamp) and no `endedAt`. The event is saved BEFORE the timer UI
 * shows (plan Phase 4), so a force-close right after Start still recovers the
 * running sleep.
 *
 * Session guard (plan Phase 4 / 6.1): only one active sleep session per child.
 * If one already exists, Start RETURNS it (`resumed: true`) instead of creating a
 * second — this is also what makes Hero + Quick Log + sheet a single source of
 * truth (any "start" lands on the same session, plan Phase 6.5). A backdated
 * start is validated not to be in the future (plan Phase 6.2). Mirrors
 * `startBreastFeed`.
 */
import { validateSessionRange } from '../domain/rules';
import type { ISODateTime, SleepEvent, SleepType } from '../domain/types';
import { selectActiveSleep } from '../state/loggingSelectors';
import { newCareEventBase, type LoggingUseCaseDeps, type UseCaseResult } from './types';

export interface StartSleepInput {
  /** Backdated start ("started earlier"); defaults to now. Must not be in the future. */
  startedAt?: ISODateTime;
  /** Nap / night / unknown — defaults to unknown; the model carries it for later. */
  sleepType?: SleepType;
  clientEventId?: string;
}

export async function startSleep(
  deps: LoggingUseCaseDeps,
  input: StartSleepInput = {},
): Promise<UseCaseResult<SleepEvent>> {
  const { repo, clock, actor } = deps;

  // One active sleep per child: a second Start reopens the existing session.
  const active = await repo.getActiveSessions({
    familyId: actor.familyId,
    childId: actor.childId,
    userId: actor.userId,
  });
  const existing = selectActiveSleep(active);
  if (existing) return { ok: true, event: existing, resumed: true };

  const startedAt = input.startedAt ?? clock.nowIso();
  const rangeCheck = validateSessionRange(startedAt, null, clock.now());
  if (!rangeCheck.ok) return rangeCheck;

  const base = newCareEventBase(actor, clock, {
    clientEventId: input.clientEventId,
    occurredAt: startedAt,
    startedAt,
    endedAt: null,
    status: 'active',
  });
  const event: SleepEvent = {
    ...base,
    type: 'sleep',
    childId: actor.childId,
    status: 'active',
    details: { sleepType: input.sleepType ?? 'unknown' },
  };

  await repo.createEvent(event);
  await repo.enqueueSync(event.id);
  return { ok: true, event };
}
