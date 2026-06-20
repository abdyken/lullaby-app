/**
 * Stops the pump timer — sets endedAt but keeps status 'active'.
 * The event remains in the store as activePump until volume is saved.
 * Pure function — no I/O.
 */
import type { PumpEvent, ISODateTime } from '../domain/types';
import { validateSessionRange } from '../domain/types';

interface FinishPumpTimerParams {
  event: PumpEvent;
  endedAt: ISODateTime;
}

export function buildFinishPumpTimer(params: FinishPumpTimerParams): PumpEvent {
  const { event, endedAt } = params;
  validateSessionRange(event.startedAt, endedAt);
  return {
    ...event,
    endedAt,
    // status stays 'active' — volume has not been recorded yet.
    // getActiveSessions will return this until buildSavePumpEvent is called.
    updatedAt: endedAt,
    version: event.version + 1,
  };
}
