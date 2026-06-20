/**
 * Logging v2 — finish a sleep session (plan Phase 6.3, §13 PR7).
 *
 * Sets `endedAt = now` and `status = completed`. The duration is ALWAYS derived
 * from `startedAt`/`endedAt` — nothing ticking is stored. This is the correct
 * replacement for the legacy MVP's hardcoded "+72 minute" finalize
 * (`endRunningSleep`/`SLEEP_FINALIZE_MIN`), the audit's highest-priority
 * behavioral bug, which logged the wrong length for every real sleep.
 *
 * The range is validated before the write so a backwards clock surfaces a
 * recover/error state instead of persisting `endedAt < startedAt` (plan §6).
 * Mirrors `finishBreastFeed`.
 */
import { validateSessionRange } from '../domain/rules';
import type { ISODateTime, SleepEvent } from '../domain/types';
import type { LoggingUseCaseDeps, UseCaseResult } from './types';

export interface FinishSleepInput {
  event: SleepEvent;
  /** When the baby woke; defaults to now. */
  at?: ISODateTime;
}

export async function finishSleep(
  deps: LoggingUseCaseDeps,
  input: FinishSleepInput,
): Promise<UseCaseResult<SleepEvent>> {
  const { repo, clock } = deps;
  const { event } = input;
  const at = input.at ?? clock.nowIso();

  const rangeCheck = validateSessionRange(event.startedAt ?? at, at, clock.now());
  if (!rangeCheck.ok) return rangeCheck;

  const next: SleepEvent = { ...event, status: 'completed', endedAt: at };
  await repo.updateEvent(next);
  await repo.enqueueSync(next.id);
  return { ok: true, event: next };
}
