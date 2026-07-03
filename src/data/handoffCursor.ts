/**
 * Handoff cursor storage — the per-caregiver "last caught up" timestamp.
 *
 * Device-local on purpose (AsyncStorage), for BOTH local and Supabase modes:
 * "have I seen what happened?" is a per-device reading state, not shared data,
 * so it never touches the backend and never blocks realtime event sync. Keyed by
 * a caller-provided context string (e.g. 'local' or '<caregiverId>:<babyId>') so
 * two accounts on one device don't share a cursor.
 *
 * The value is epoch milliseconds. Every call degrades to "no cursor" (null) on
 * any failure rather than crashing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Key prefix for every handoff cursor. Exported so the account-deletion contract
 * (`./accountReset`) can match + clear all cursors by prefix without duplicating
 * the string. A plain constant (no React/AsyncStorage), so pure importers are
 * unaffected.
 */
export const HANDOFF_CURSOR_PREFIX = 'lullaby/handoff-cursor/';
const PREFIX = HANDOFF_CURSOR_PREFIX;

/** The cursor context used in local-only demo mode (no per-caregiver scoping). */
export const LOCAL_CURSOR_CONTEXT = 'local';

function keyFor(context: string): string {
  return `${PREFIX}${context}`;
}

/** Load the cursor (epoch ms) for a context, or null if unset/unreadable. */
export async function loadHandoffCursor(context: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(context));
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Persist the cursor (epoch ms) for a context. Silent on failure. */
export async function saveHandoffCursor(context: string, value: number): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(context), String(value));
  } catch {
    // best-effort — losing a cursor write only re-shows a summary the user saw
  }
}

/**
 * Forget the cursor for a context (back to "never caught up"). Used by the local
 * demo reset so a fresh seeded night shows its catch-up story again instead of
 * "Nothing new". Silent on failure.
 */
export async function clearHandoffCursor(context: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(context));
  } catch {
    // best-effort — a failed clear just leaves the prior cursor in place
  }
}
