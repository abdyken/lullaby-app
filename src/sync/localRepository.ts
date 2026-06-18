/**
 * Local repository — the default backend, used whenever Supabase is not
 * configured or there is no signed-in session.
 *
 * It is a thin pass-through to the existing AsyncStorage helpers so the local
 * demo behaves EXACTLY as before (same storage key, same validation, same
 * silent-failure semantics). Introducing the repository boundary must not change
 * a single byte of how local data is read or written.
 */
import { clearLocalEventStorage, loadPersistedState, savePersistedState } from '@/data/localStorage';
import type { TonightState } from '@/data/localInteractions';

import type { EventRepository } from './types';

export const localRepository: EventRepository = {
  mode: 'local-only',
  load: () => loadPersistedState(),
  save: (state: TonightState) => savePersistedState(state),
  clear: () => clearLocalEventStorage(),
};
