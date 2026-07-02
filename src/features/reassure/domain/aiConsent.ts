/**
 * AI night-read consent — the pure, private helpers behind the one-time
 * opt-in for the Pro LLM night read.
 *
 * PURE LEAF: no react/react-native, no AsyncStorage, no network, no analytics.
 * The device I/O lives in application/aiConsentStore.ts; the React glue in
 * application/useAiNightReadConsent.ts. Keeping the shaping here (like the other
 * pure domain leaves) means the smoke runner can exercise it under plain
 * Node/tsx.
 *
 * PRIVACY: the consent STATE itself is private and LOCAL. It is never sent to
 * analytics, Supabase, an LLM prompt, or a log line — it only decides, on the
 * device, whether the client is allowed to call the night-read edge function.
 * The night-read payload carries only { babyId, nightKey, tzOffsetMinutes };
 * consent, the pediatrician phone, and raw parent text never leave the device
 * through this path.
 */

/** AsyncStorage key. Dotted/namespaced/versioned, like the other local settings keys. */
export const AI_NIGHT_READ_CONSENT_KEY = 'lullaby.reassure.aiNightReadConsent.v1';

/**
 * The decided consent state. Absence (null) means "not yet asked" — the one-time
 * notice is still owed. 'granted' allows the client to call the edge function;
 * 'declined' keeps AI off but never blocks the local read.
 */
export type AiNightReadConsent = 'granted' | 'declined';

/** Serialize a decision for storage. */
export function serializeAiConsent(status: AiNightReadConsent): string {
  return status;
}

/**
 * Parse a value read back from storage into a decided state, or null for
 * anything we can't trust (absent, empty, or corrupt) so callers treat "not yet
 * decided" as a single calm case and re-show the one-time notice.
 */
export function parseAiConsent(raw: string | null | undefined): AiNightReadConsent | null {
  if (raw === 'granted' || raw === 'declined') return raw;
  return null;
}

/** Whether a decided state permits the client to attempt the AI night read. */
export function consentAllowsAiNightRead(status: AiNightReadConsent | null): boolean {
  return status === 'granted';
}
