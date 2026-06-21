/**
 * Logging v2 — cancel a pump session (plan Phase 7 state machine
 * `running → cancelled`).
 *
 * Marks the event `cancelled` (NOT `completed`), so the repository's today/active
 * reads both exclude it: an abandoned pump never becomes a logged pump and never
 * lingers as an active timer or a volume draft. Mirrors `cancelSleep`.
 */
import type { PumpEvent } from '../domain/types';
import type { LoggingUseCaseDeps, UseCaseResult } from './types';

export async function cancelPump(
  deps: LoggingUseCaseDeps,
  input: { event: PumpEvent },
): Promise<UseCaseResult<PumpEvent>> {
  const { repo, clock } = deps;
  const next: PumpEvent = {
    ...input.event,
    status: 'cancelled',
    endedAt: input.event.endedAt ?? clock.nowIso(),
  };
  await repo.updateEvent(next);
  return { ok: true, event: next };
}
