/**
 * Logging v2 — undo the last logging mutation (plan §8, §3 `undoLoggingMutation`).
 *
 * The single live Undo. A completing/instant action records an `UndoableMutation`
 * snapshot; this use-case applies its inverse:
 *   - `create` (an instant log — diaper, bottle, manual completed sleep) →
 *     soft-delete exactly the event that was created (plan §8 "Undo create →
 *     soft delete created event").
 *   - `finish`/`update`/`delete` → restore the `previousSnapshot` (plan §8
 *     "Undo finish → restore previous active snapshot if no new conflict
 *     appeared"). For an undo-finish the snapshot is the still-active session, so
 *     the restore is refused when another active session of the same kind/scope
 *     started meanwhile.
 *
 * Undo itself enters the sync queue (plan §8). Pure async over the repo + actor —
 * no React, no AsyncStorage — so it runs under the Node smoke test alongside the
 * other use-cases.
 */
import { loggingError, type LoggingError } from '../domain/errors';
import { newUuid } from '../domain/ids';
import type { CareEvent, ISODateTime, UndoableMutation } from '../domain/types';
import type { Clock } from '../timer/clock';
import type { LoggingUseCaseDeps } from './types';

/** How long the Undo affordance stays live after a mutation (plan §8 `expiresAt`). */
export const UNDO_WINDOW_MS = 6_000;

/** The outcome of an undo — `ok` when applied, an error when refused (e.g. a conflict). */
export type UndoResult = { ok: true } | { ok: false; error: LoggingError };

/**
 * Build the `UndoableMutation` snapshot for a just-completed mutation (plan §8).
 * A fresh `mutationId` is what makes a new action replace the previous Undo
 * context; `expiresAt` is stamped from the clock. `previousSnapshot` is the event
 * as it was BEFORE the mutation — null for a `create` (there is nothing to
 * restore; undo soft-deletes the created event instead).
 */
export function buildUndoableMutation(input: {
  kind: UndoableMutation['kind'];
  eventId: string;
  previousSnapshot: CareEvent | null;
  clock: Clock;
}): UndoableMutation {
  const expiresAt: ISODateTime = new Date(input.clock.now() + UNDO_WINDOW_MS).toISOString();
  return {
    mutationId: newUuid(),
    kind: input.kind,
    eventId: input.eventId,
    previousSnapshot: input.previousSnapshot,
    expiresAt,
  };
}

/**
 * Whether another active session of the same kind/scope appeared (plan §8 conflict
 * guard). `getActiveSessions` is already scoped — sleep/breast to the child, pump
 * to the caregiver — so a different active event of the same `type` is the
 * conflict. The snapshot's own id is excluded (it is completed at this point, so
 * it is normally absent anyway).
 */
async function hasConflictingActiveSession(
  deps: LoggingUseCaseDeps,
  snapshot: CareEvent,
): Promise<boolean> {
  const { repo, actor } = deps;
  const active = await repo.getActiveSessions({
    familyId: actor.familyId,
    childId: actor.childId,
    userId: actor.userId,
  });
  return active.some((e) => e.id !== snapshot.id && e.type === snapshot.type);
}

export async function undoLoggingMutation(
  deps: LoggingUseCaseDeps,
  mutation: UndoableMutation,
): Promise<UndoResult> {
  const { repo } = deps;

  // Undo create → soft-delete exactly the event that was created (plan §8).
  if (mutation.kind === 'create') {
    await repo.softDeleteEvent(mutation.eventId);
    await repo.enqueueSync(mutation.eventId);
    return { ok: true };
  }

  // Undo finish/update/delete → restore the previous snapshot.
  const snapshot = mutation.previousSnapshot;
  if (!snapshot) {
    return { ok: false, error: loggingError('undo_unavailable', 'There is nothing to undo.') };
  }

  // Restoring an active session is refused if another one of the same kind/scope
  // started meanwhile (plan §8 "if no new conflict appeared").
  if (snapshot.status === 'active' && (await hasConflictingActiveSession(deps, snapshot))) {
    return {
      ok: false,
      error: loggingError('undo_conflict', 'Another session has started, so this can’t be undone.'),
    };
  }

  await repo.updateEvent(snapshot);
  await repo.enqueueSync(snapshot.id);
  return { ok: true };
}
