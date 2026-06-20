/**
 * Logging v2 — save a bottle feed (plan Phase 3 / §13 PR4).
 *
 * Bottle is an INSTANT quantity event, never an active session: there is no
 * timer, `startedAt`/`endedAt` stay null, and it is created already `completed`.
 * The amount is validated (`validateBottleAmount` — no save at `<= 0`, plan
 * Phase 3) before any write. The create is idempotent by `clientEventId`, so a
 * double-tap on Save lands a single event (plan Phase 3 acceptance).
 */
import { validateBottleAmount } from '../domain/rules';
import type { BottleFeedEvent, ISODateTime, MilkType } from '../domain/types';
import { newCareEventBase, type LoggingUseCaseDeps, type UseCaseResult } from './types';

export interface SaveBottleFeedInput {
  amountMl: number;
  milkType: MilkType;
  /** Pass a stable id to dedupe retries/double-taps; defaults to a fresh one. */
  clientEventId?: string;
  /** When the feed happened; defaults to now. */
  occurredAt?: ISODateTime;
}

export async function saveBottleFeed(
  deps: LoggingUseCaseDeps,
  input: SaveBottleFeedInput,
): Promise<UseCaseResult<BottleFeedEvent>> {
  const check = validateBottleAmount(input.amountMl);
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
  const event: BottleFeedEvent = {
    ...base,
    type: 'feed',
    childId: actor.childId,
    status: 'completed',
    method: 'bottle',
    details: { amountMl: input.amountMl, milkType: input.milkType },
  };

  await repo.createEvent(event);
  await repo.enqueueSync(event.id);
  return { ok: true, event };
}
