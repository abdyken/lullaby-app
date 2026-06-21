/**
 * Logging v2 — log an already-finished sleep (plan Phase 6.4 "Add a completed
 * sleep").
 *
 * Creates a `completed` `SleepEvent` immediately from an explicit start/end — it
 * does NOT start an active timer (plan Phase 6.4). Both timestamps are validated
 * as a clean, non-future, correctly-ordered range (plan §6). `occurredAt =
 * startedAt` so the sleep sorts into the timeline at the time it began. The model
 * accepts an arbitrary range, so a richer time picker can replace the duration
 * presets later without touching this use-case (plan Phase 6.2 / 6.4).
 */
import { validateSessionRange } from '../domain/rules';
import type { ISODateTime, SleepEvent, SleepType } from '../domain/types';
import { newCareEventBase, type LoggingUseCaseDeps, type UseCaseResult } from './types';

export interface SaveCompletedSleepInput {
  startedAt: ISODateTime;
  endedAt: ISODateTime;
  sleepType?: SleepType;
  clientEventId?: string;
}

export async function saveCompletedSleep(
  deps: LoggingUseCaseDeps,
  input: SaveCompletedSleepInput,
): Promise<UseCaseResult<SleepEvent>> {
  const { repo, clock, actor } = deps;

  const rangeCheck = validateSessionRange(input.startedAt, input.endedAt, clock.now());
  if (!rangeCheck.ok) return rangeCheck;

  const base = newCareEventBase(actor, clock, {
    clientEventId: input.clientEventId,
    occurredAt: input.startedAt,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    status: 'completed',
  });
  const event: SleepEvent = {
    ...base,
    type: 'sleep',
    childId: actor.childId,
    status: 'completed',
    details: { sleepType: input.sleepType ?? 'unknown' },
  };

  await repo.createEvent(event);
  await repo.enqueueSync(event.id);
  return { ok: true, event };
}
