/**
 * Builds a completed SleepEvent from an active one.
 * Pure function — no I/O. Caller passes the result to store.finishSession().
 */
import type { SleepEvent, ISODateTime } from '../domain/types';
import { validateSessionRange } from '../domain/types';

interface FinishSleepParams {
  event: SleepEvent;
  endedAt: ISODateTime;
}

export function buildFinishSleepEvent({ event, endedAt }: FinishSleepParams): SleepEvent {
  validateSessionRange(event.startedAt, endedAt);
  return {
    ...event,
    status: 'completed',
    endedAt,
    updatedAt: endedAt,
    version: event.version + 1,
  };
}
