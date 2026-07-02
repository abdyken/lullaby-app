/**
 * AsyncStorage I/O for the AI night-read consent decision.
 *
 * The only module that touches the device store for this setting. All shaping /
 * validation lives in domain/aiConsent.ts (pure, testable). Every call is
 * wrapped so a storage failure or corrupt payload degrades to "not yet decided"
 * (null) instead of crashing — and "not yet decided" is the SAFE default: it
 * keeps AI off and re-shows the one-time notice rather than silently enabling
 * the model.
 *
 * PRIVACY: the consent state is kept LOCAL under AI_NIGHT_READ_CONSENT_KEY only.
 * It is never sent to analytics, Supabase, an LLM, or a log line — it only
 * decides, on the device, whether the night-read edge function may be called.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AI_NIGHT_READ_CONSENT_KEY,
  parseAiConsent,
  serializeAiConsent,
  type AiNightReadConsent,
} from '@/features/reassure/domain/aiConsent';

/** Load the decided state. Returns null if absent, unreadable, or corrupt. */
export async function loadAiNightReadConsent(): Promise<AiNightReadConsent | null> {
  try {
    return parseAiConsent(await AsyncStorage.getItem(AI_NIGHT_READ_CONSENT_KEY));
  } catch {
    return null;
  }
}

/**
 * Persist a decision. Best-effort: if the device store rejects the write the
 * caller still gets the value for the current session (so the card dismisses),
 * and the notice simply re-appears next launch — never a crash, never a silent
 * enable.
 */
export async function saveAiNightReadConsent(status: AiNightReadConsent): Promise<AiNightReadConsent> {
  try {
    await AsyncStorage.setItem(AI_NIGHT_READ_CONSENT_KEY, serializeAiConsent(status));
  } catch {
    // best-effort — losing the write only means the notice re-appears next launch
  }
  return status;
}

/** Drop the saved decision (e.g. a dev reset). Best-effort, silent on failure. */
export async function clearAiNightReadConsent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AI_NIGHT_READ_CONSENT_KEY);
  } catch {
    // ignore — a stale decision only ever gates a polish layer, never safety
  }
}
