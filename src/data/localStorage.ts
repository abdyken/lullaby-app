/**
 * AsyncStorage I/O for the local night state.
 *
 * The only module that touches the device store. All shaping/validation is in
 * './persistedState' (pure, testable). Every call is wrapped so a storage
 * failure or corrupt payload degrades to "no saved data" instead of crashing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TonightState } from './localInteractions';
import { STORAGE_KEY, parsePersistedState, serializeState } from './persistedState';

/** Load + validate saved state. Returns null if absent, unreadable, or invalid. */
export async function loadPersistedState(): Promise<TonightState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return parsePersistedState(raw);
  } catch {
    return null;
  }
}

/** Persist the current state (events + orbView only). Silent on failure. */
export async function savePersistedState(state: TonightState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, serializeState(state));
  } catch {
    // best-effort local cache — losing a write is not worth crashing for
  }
}

/** Debug helper: drop the saved state so the next launch falls back to seed. */
export async function clearLocalEventStorage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
