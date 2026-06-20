/**
 * Logging v2 — cancel a breastfeeding session (plan Phase 5 state machine
 * `running → cancelled`, acceptance "Cancel does not appear in the timeline").
 *
 * Marks the event `cancelled` (NOT `completed`), so the repository's today/active
 * reads both exclude it: a cancelled session never becomes a logged feed and
 * never lingers as an active timer. Distinct from finish — there is no duration
 * to keep and no Undo-able "completed feed" is produced.
 */
import type { BreastFeedEvent } from '../domain/types';
import type { LoggingUseCaseDeps, UseCaseResult } from './types';

export async function cancelBreastFeed(
  deps: LoggingUseCaseDeps,
  input: { event: BreastFeedEvent },
): Promise<UseCaseResult<BreastFeedEvent>> {
  const { repo, clock } = deps;
  const next: BreastFeedEvent = {
    ...input.event,
    status: 'cancelled',
    endedAt: clock.nowIso(),
    details: { ...input.event.details, activeSide: null },
  };
  await repo.updateEvent(next);
  return { ok: true, event: next };
}
