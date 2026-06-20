/**
 * undoLoggingMutation — reverses the most recent undoable store mutation.
 *
 * - create / delete → soft-deletes the created event.
 * - finish / update → restores the previousSnapshot (active or prior state).
 *
 * Always clears lastMutation after executing so the toast disappears.
 */
import type { UndoableMutation } from '../domain/types';
import type { LoggingStoreContextValue } from '../state/loggingStore';

type StoreForUndo = Pick<
  LoggingStoreContextValue,
  'softDeleteEvent' | 'restoreSession' | 'setLastMutation'
>;

export async function undoLoggingMutation(
  mutation: UndoableMutation,
  store: StoreForUndo,
): Promise<void> {
  // If the mutation has expired, just clear it.
  if (new Date(mutation.expiresAt).getTime() < Date.now()) {
    store.setLastMutation(null);
    return;
  }

  switch (mutation.kind) {
    case 'create':
    case 'delete':
      await store.softDeleteEvent(mutation.eventId);
      break;
    case 'finish':
    case 'update':
      if (mutation.previousSnapshot) {
        await store.restoreSession(mutation.previousSnapshot);
      }
      break;
  }

  store.setLastMutation(null);
}
