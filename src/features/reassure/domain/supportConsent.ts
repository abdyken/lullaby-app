/**
 * AI support-companion consent — the pure, private helpers behind the one-time
 * opt-in for the free-text emotional-support path (reassure-support).
 *
 * This is SEPARATE from the night-read consent (domain/aiConsent.ts) on purpose:
 * the two paths send fundamentally different data. The night read sends only
 * minimized numeric tallies; the companion sends the parent's OWN WORDS to
 * Anthropic. Because the privacy statements differ, the consent decisions are
 * stored under different keys and asked with different copy — a night-read grant
 * must never silently authorize sending typed text, or vice versa.
 *
 * PURE LEAF: no react/react-native, no AsyncStorage, no network, no analytics.
 * Device I/O lives in application/supportConsentStore.ts; the React glue in
 * application/useAiSupportConsent.ts.
 *
 * PRIVACY: the consent STATE is private and LOCAL — never sent to analytics,
 * Supabase, an LLM prompt, or a log line. It only decides, on the device,
 * whether the client may call the support edge function.
 */

/** AsyncStorage key. Distinct from the night-read consent key by design. */
export const AI_SUPPORT_CONSENT_KEY = 'lullaby.reassure.aiSupportConsent.v1';

/**
 * The decided consent state. Absence (null) means "not yet asked" — the one-time
 * notice is still owed. 'granted' allows the client to call the support edge
 * function; 'declined' keeps the companion off but never blocks safety routing.
 */
export type AiSupportConsent = 'granted' | 'declined';

/** Serialize a decision for storage. */
export function serializeSupportConsent(status: AiSupportConsent): string {
  return status;
}

/**
 * Parse a value read back from storage into a decided state, or null for
 * anything we can't trust (absent, empty, or corrupt) so callers treat "not yet
 * decided" as a single calm case and re-show the one-time notice.
 */
export function parseSupportConsent(raw: string | null | undefined): AiSupportConsent | null {
  if (raw === 'granted' || raw === 'declined') return raw;
  return null;
}

/** Whether a decided state permits the client to attempt an AI support reply. */
export function consentAllowsSupport(status: AiSupportConsent | null): boolean {
  return status === 'granted';
}
