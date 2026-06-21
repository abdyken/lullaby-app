/**
 * Logging v2 — start a pump session (plan Phase 7.1, §13 PR8).
 *
 * Creates an ACTIVE `PumpEvent` on the chosen side (left / right / both) with
 * `startedAt` and no `endedAt`, and saves it BEFORE the timer UI shows (plan
 * Phase 4), so a force-close right after Start still recovers the running pump.
 *
 * Pump belongs to the CAREGIVER, not the baby (plan §4.4): `subjectUserId` is the
 * current caregiver and the session is scoped by it, so a co-caregiver's pump on
 * another device never lands in this caregiver's slot. `childId` is kept as an
 * optional family association so the pump still appears in the family timeline.
 *
 * Session guard (plan Phase 4 / §4 "one active pump per caregiver"): if a pump
 * session already exists for this caregiver, Start RETURNS it (`resumed: true`)
 * instead of creating a second — mirroring `startSleep`/`startBreastFeed`. A
 * backdated start is validated not to be in the future (plan §6).
 */
import { validatePumpVolumes, validateSessionRange } from '../domain/rules';
import type { ISODateTime, PumpEvent, PumpSide } from '../domain/types';
import { selectActivePump } from '../state/loggingSelectors';
import { newCareEventBase, type LoggingUseCaseDeps, type UseCaseResult } from './types';

export interface StartPumpInput {
  side: PumpSide;
  /** Backdated start; defaults to now. Must not be in the future. */
  startedAt?: ISODateTime;
  clientEventId?: string;
}

export async function startPump(
  deps: LoggingUseCaseDeps,
  input: StartPumpInput,
): Promise<UseCaseResult<PumpEvent>> {
  const { repo, clock, actor } = deps;

  // Validate the side up front (reuses the pump validator with no volumes yet).
  const sideCheck = validatePumpVolumes({
    side: input.side,
    leftVolumeMl: null,
    rightVolumeMl: null,
  });
  if (!sideCheck.ok) return sideCheck;

  // One active pump per caregiver: a second Start reopens the existing session
  // (which may be a running timer or a finished session still awaiting its
  // volume), never a duplicate.
  const active = await repo.getActiveSessions({
    familyId: actor.familyId,
    childId: actor.childId,
    userId: actor.userId,
  });
  const existing = selectActivePump(active, actor.userId);
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
  const event: PumpEvent = {
    ...base,
    type: 'pump',
    childId: actor.childId, // optional family association (plan §4.4)
    subjectUserId: actor.userId, // pump belongs to the caregiver
    status: 'active',
    details: { side: input.side, leftVolumeMl: null, rightVolumeMl: null },
  };

  await repo.createEvent(event);
  await repo.enqueueSync(event.id);
  return { ok: true, event };
}
