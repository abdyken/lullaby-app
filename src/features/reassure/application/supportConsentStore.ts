/**
 * AsyncStorage I/O for the AI support-companion consent decision.
 *
 * The only module that touches the device store for this setting. All shaping /
 * validation lives in domain/supportConsent.ts (pure, testable). Every call is
 * wrapped so a storage failure or corrupt payload degrades to "not yet decided"
 * (null) — the SAFE default: it keeps the companion off and re-shows the notice
 * rather than silently sending the parent's typed words to the model.
 *
 * PRIVACY: the consent state is kept LOCAL under AI_SUPPORT_CONSENT_KEY only. It
 * is never sent to analytics, Supabase, an LLM, or a log line — it only decides,
 * on the device, whether the support edge function may be called.
 *
 * CHANGE PROPAGATION: the decision is edited from two surfaces (the just-in-time
 * consent card on the Reassure tab AND the revoke toggle in Settings). Because
 * the tab screens stay mounted, a write from one surface must reach the other's
 * already-loaded hook, or a revoke in Settings would leave a stale "granted" in
 * the Reassure hook and the next ask would send without re-consent. So every
 * write notifies subscribers with the new value; useAiSupportConsent subscribes
 * so all consumers converge on the persisted decision immediately.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AI_SUPPORT_CONSENT_KEY,
  parseSupportConsent,
  serializeSupportConsent,
  type AiSupportConsent,
} from '@/features/reassure/domain/supportConsent';

type SupportConsentListener = (value: AiSupportConsent | null) => void;

const listeners = new Set<SupportConsentListener>();

/**
 * Subscribe to consent changes made anywhere in the app. Returns an unsubscribe
 * fn. The listener is called with the newly written value (or null on clear) —
 * synchronously right after the write — so no async re-read/race is involved.
 */
export function subscribeSupportConsent(listener: SupportConsentListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifySupportConsent(value: AiSupportConsent | null): void {
  for (const listener of listeners) listener(value);
}

/** Load the decided state. Returns null if absent, unreadable, or corrupt. */
export async function loadSupportConsent(): Promise<AiSupportConsent | null> {
  try {
    return parseSupportConsent(await AsyncStorage.getItem(AI_SUPPORT_CONSENT_KEY));
  } catch {
    return null;
  }
}

/**
 * Persist a decision. Best-effort: if the device store rejects the write the
 * caller still gets the value for the current session, and the notice simply
 * re-appears next launch — never a crash, never a silent enable.
 */
export async function saveSupportConsent(status: AiSupportConsent): Promise<AiSupportConsent> {
  try {
    await AsyncStorage.setItem(AI_SUPPORT_CONSENT_KEY, serializeSupportConsent(status));
  } catch {
    // best-effort — losing the write only means the notice re-appears next launch
  }
  // Notify regardless of write success: in-session consumers must converge on the
  // decision even if the disk write failed (the notice re-appears next launch).
  notifySupportConsent(status);
  return status;
}

/** Drop the saved decision (e.g. a dev reset). Best-effort, silent on failure. */
export async function clearSupportConsent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AI_SUPPORT_CONSENT_KEY);
  } catch {
    // ignore — a stale decision only ever gates the companion, never safety
  }
  notifySupportConsent(null);
}
