/**
 * Logging v2 — save a diaper change (plan Phase 2 / §13 PR3 — the canonical
 * two-tap flow, the simplest event and the one that validates the architecture).
 *
 * Diaper is an INSTANT log, never an active session: there is no timer,
 * `startedAt`/`endedAt` stay null, and it is created already `completed` with
 * `occurredAt = now`. The kind is validated (`validateDiaperKind` — one of
 * wet / dirty / both / dry, plan §4.3) before any write. The create is
 * idempotent by `clientEventId`, so a fumbled double-tap lands a single event
 * (plan Phase 2 acceptance).
 *
 * `rash`/`note` exist on the model (plan §4.3) but are deliberately NOT part of
 * the quick-log path — they stay optional and absent here so a wet diaper is two
 * taps: Diaper → Wet.
 */
import { validateDiaperKind } from '../domain/rules';
import type { DiaperEvent, DiaperKind, ISODateTime } from '../domain/types';
import { newCareEventBase, type LoggingUseCaseDeps, type UseCaseResult } from './types';

export interface SaveDiaperInput {
  kind: DiaperKind;
  /** Pass a stable id to dedupe retries/double-taps; defaults to a fresh one. */
  clientEventId?: string;
  /** When the change happened; defaults to now. */
  occurredAt?: ISODateTime;
}

export async function saveDiaper(
  deps: LoggingUseCaseDeps,
  input: SaveDiaperInput,
): Promise<UseCaseResult<DiaperEvent>> {
  const check = validateDiaperKind(input.kind);
  if (!check.ok) return check;

  const { repo, clock, actor } = deps;
  const occurredAt = input.occurredAt ?? clock.nowIso();
  const base = newCareEventBase(actor, clock, {
    clientEventId: input.clientEventId,
    occurredAt,
    startedAt: null,
    endedAt: null,
    status: 'completed',
  });
  const event: DiaperEvent = {
    ...base,
    type: 'diaper',
    childId: actor.childId,
    status: 'completed',
    details: { kind: input.kind },
  };

  await repo.createEvent(event);
  await repo.enqueueSync(event.id);
  return { ok: true, event };
}
