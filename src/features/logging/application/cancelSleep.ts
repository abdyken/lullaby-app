/**
 * Logging v2 — cancel a sleep session (plan Phase 6 state machine
 * `running → cancelled`).
 *
 * Marks the event `cancelled` (NOT `completed`), so the repository's today/active
 * reads both exclude it: an abandoned sleep never becomes a logged sleep and
 * never lingers as an active timer. This is also what makes "the app does not
 * finish sleep automatically" safe — closing/cancelling is explicit and distinct
 * from finishing. Mirrors `cancelBreastFeed`.
 */
import type { SleepEvent } from '../domain/types';
import type { LoggingUseCaseDeps, UseCaseResult } from './types';

export async function cancelSleep(
  deps: LoggingUseCaseDeps,
  input: { event: SleepEvent },
): Promise<UseCaseResult<SleepEvent>> {
  const { repo, clock } = deps;
  const next: SleepEvent = {
    ...input.event,
    status: 'cancelled',
    endedAt: clock.nowIso(),
  };
  await repo.updateEvent(next);
  return { ok: true, event: next };
}
