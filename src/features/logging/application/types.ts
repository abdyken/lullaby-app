/**
 * Logging v2 — application layer shared types (plan §3 `domain → application`).
 *
 * The use-cases (start/switch/finish breast, save bottle, …) are pure async
 * functions that take their dependencies explicitly — a `LoggingRepository`, a
 * `Clock`, and the current `LoggingActor` — so they are unit-testable with an
 * in-memory repo + a fake clock under the Node smoke test, with no React and no
 * AsyncStorage. The React provider (`state/LoggingProvider`) is the only place
 * that supplies the real device repo + system clock.
 *
 * Each use-case returns a `UseCaseResult` instead of throwing: a validation
 * failure flows back as `{ ok: false, error }` so the store can render a
 * recover/error state (plan §6) rather than crashing.
 */
import type { Clock } from '../timer/clock';
import type { LoggingError } from '../domain/errors';
import {
  newClientEventId,
  newUuid,
} from '../domain/ids';
import type {
  CareEvent,
  CareEventBase,
  CareEventStatus,
  ISODateTime,
} from '../domain/types';
import type { LoggingRepository } from '../data/LoggingRepository';

/**
 * Who is logging, and for whom. `userId` is the current caregiver — it is the
 * `createdByUserId` on every event AND the `subjectUserId`/active-session scope
 * for pump (plan §4.4). `familyId` mirrors the child scope for now (audit §13).
 */
export interface LoggingActor {
  familyId: string;
  childId: string;
  userId: string;
}

/** The explicit dependencies every use-case takes (no globals, no I/O at import). */
export interface LoggingUseCaseDeps {
  repo: LoggingRepository;
  clock: Clock;
  actor: LoggingActor;
}

/**
 * The outcome of a use-case. On success the resulting event is returned (so the
 * provider can refresh/optimistically apply it); `resumed` flags that an existing
 * active session was returned instead of a new one, and `noop` flags an ignored
 * action (e.g. switching to the side that is already active — plan §5.2).
 */
export type UseCaseResult<T extends CareEvent> =
  | { ok: true; event: T; resumed?: boolean; noop?: boolean }
  | { ok: false; error: LoggingError };

/** Standard UTC-offset minutes (east-positive), derived from a clock reading. */
export function timezoneOffsetMinutes(now: number): number {
  return -new Date(now).getTimezoneOffset();
}

/**
 * Build the shared `CareEventBase` for a freshly created event. The concrete
 * use-case spreads this and overwrites the type-specific fields (`type`,
 * `method`, narrowed `childId`/`status`, `details`). A new random `id` and
 * `clientEventId` are minted here; pass a stable `clientEventId` to make a retry
 * idempotent (plan §9). `syncStatus` starts `local` (plan §1.4).
 */
export function newCareEventBase(
  actor: LoggingActor,
  clock: Clock,
  input: {
    clientEventId?: string;
    occurredAt: ISODateTime;
    startedAt: ISODateTime | null;
    endedAt: ISODateTime | null;
    status: CareEventStatus;
  },
): CareEventBase {
  const nowIso = clock.nowIso();
  return {
    id: newUuid(),
    clientEventId: input.clientEventId ?? newClientEventId(),
    familyId: actor.familyId,
    childId: actor.childId,
    createdByUserId: actor.userId,
    type: 'feed', // placeholder — the concrete use-case overwrites this
    status: input.status,
    occurredAt: input.occurredAt,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    timezoneOffsetMinutes: timezoneOffsetMinutes(clock.now()),
    createdAt: nowIso,
    updatedAt: nowIso,
    syncStatus: 'local',
    version: 1,
  };
}
