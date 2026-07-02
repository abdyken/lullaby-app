/**
 * AsyncStorage I/O for the pediatrician phone number.
 *
 * The only module that touches the device store for this setting. All shaping /
 * validation lives in domain/pediatricianContact.ts (pure, testable). Every call
 * is wrapped so a storage failure or corrupt payload degrades to "no saved
 * number" instead of crashing — a tired parent must never be blocked by a bad
 * read/write.
 *
 * PRIVACY: this is the parent's own number, kept LOCAL. It is stored ONLY under
 * PEDIATRICIAN_PHONE_KEY and is never sent to analytics, Supabase, an LLM, or a
 * log line.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PEDIATRICIAN_PHONE_KEY,
  normalizePediatricianPhone,
  parsePediatricianPhone,
} from '@/features/reassure/domain/pediatricianContact';

/** Load + validate the saved number. Returns null if absent, unreadable, or unusable. */
export async function loadPediatricianPhone(): Promise<string | null> {
  try {
    return parsePediatricianPhone(await AsyncStorage.getItem(PEDIATRICIAN_PHONE_KEY));
  } catch {
    return null;
  }
}

/**
 * Normalize + persist the number, returning the dialable value that was saved
 * (or null when the input carries nothing dialable, in which case any prior
 * value is cleared). Best-effort on write: if the device store rejects it, the
 * caller still gets the normalized value so the current session can dial.
 */
export async function savePediatricianPhone(raw: string): Promise<string | null> {
  const dialable = parsePediatricianPhone(raw);
  try {
    if (dialable == null) {
      await AsyncStorage.removeItem(PEDIATRICIAN_PHONE_KEY);
      return null;
    }
    await AsyncStorage.setItem(PEDIATRICIAN_PHONE_KEY, normalizePediatricianPhone(raw));
    return dialable;
  } catch {
    // best-effort — losing the write only means it isn't remembered next launch
    return dialable;
  }
}

/** Drop the saved number (e.g. a dev reset). Best-effort, silent on failure. */
export async function clearPediatricianPhone(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PEDIATRICIAN_PHONE_KEY);
  } catch {
    // ignore — a stale local number is only ever used to prefill a dialer
  }
}
