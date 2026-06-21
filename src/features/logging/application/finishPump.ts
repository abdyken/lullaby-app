/**
 * Logging v2 — finish a pump timer (plan Phase 7.2, §13 PR8).
 *
 * Sets `endedAt = now` but DELIBERATELY does NOT complete the event: the status
 * stays `active`, so the finished session keeps appearing in `getActiveSessions`
 * and is therefore recovered after a restart. The store turns this "active with
 * an `endedAt`" event into a `pumpVolumeDraft` (see `applyActiveSessions`), which
 * is exactly the plan's "move the session into the volume draft; the draft must
 * survive sheet close and app restart" (Phase 7.2). The completed event is only
 * written later by `savePump` once the (optional) volume is entered.
 *
 * The range is validated before the write so a backwards clock surfaces a
 * recover/error state instead of persisting `endedAt < startedAt` (plan §6).
 */
import { validateSessionRange } from '../domain/rules';
import type { ISODateTime, PumpEvent } from '../domain/types';
import type { LoggingUseCaseDeps, UseCaseResult } from './types';

export interface FinishPumpInput {
  event: PumpEvent;
  /** When pumping stopped; defaults to now. */
  at?: ISODateTime;
}

export async function finishPump(
  deps: LoggingUseCaseDeps,
  input: FinishPumpInput,
): Promise<UseCaseResult<PumpEvent>> {
  const { repo, clock } = deps;
  const { event } = input;
  const at = input.at ?? clock.nowIso();

  const rangeCheck = validateSessionRange(event.startedAt ?? at, at, clock.now());
  if (!rangeCheck.ok) return rangeCheck;

  // Keep status 'active' (with endedAt set) → the store reads this as a volume
  // draft; savePump is what finally completes it.
  const next: PumpEvent = { ...event, endedAt: at };
  await repo.updateEvent(next);
  await repo.enqueueSync(next.id);
  return { ok: true, event: next };
}
