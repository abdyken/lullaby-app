/**
 * Pediatrician phone contact — the pure, private helpers behind Reassure's
 * triage "Call pediatrician" action.
 *
 * PURE LEAF: no react/react-native, no AsyncStorage, no network, no analytics.
 * The device I/O lives in application/pediatricianStore.ts; the React glue in
 * application/usePediatricianPhone.ts. Keeping the shaping here (like
 * data/persistedState.ts) means the smoke runner can exercise it under plain
 * Node/tsx.
 *
 * PRIVACY: the number is the parent's own, kept LOCAL. It is never serialized
 * into analytics, logs, Supabase, or any LLM prompt — only into a `tel:` URL the
 * OS dialer consumes. Normalization is deliberately light (no country rules).
 */

/** AsyncStorage key. Dotted/namespaced/versioned, matching onboardingStorage. */
export const PEDIATRICIAN_PHONE_KEY = 'lullaby.reassure.pediatricianPhone.v1';

/**
 * Light normalization: trim, keep only the characters a human writes into a
 * phone number (`+`, digits, spaces, dashes, parentheses), drop everything else,
 * and collapse runs of whitespace to a single space. No country-specific
 * validation — a tired parent's "+1 (555) 123-4567" must survive intact.
 */
export function normalizePediatricianPhone(raw: string | null | undefined): string {
  if (raw == null) return '';
  return raw
    .replace(/[^+\d\s()-]/g, '') // keep + digits space dash parens; drop letters/symbols
    .replace(/\s+/g, ' ') // collapse duplicate whitespace
    .trim();
}

/** A stored value is only dialable once it actually contains at least one digit. */
export function hasDialablePhone(value: string | null | undefined): boolean {
  return value != null && /\d/.test(value);
}

/**
 * Parse a value read back from storage. Returns the normalized number, or null
 * for anything we can't dial (absent, empty, whitespace/punctuation only, or
 * corrupt) so callers treat "nothing usable" as a single calm case.
 */
export function parsePediatricianPhone(raw: string | null | undefined): string | null {
  const normalized = normalizePediatricianPhone(raw);
  return hasDialablePhone(normalized) ? normalized : null;
}

/**
 * Build the `tel:` URL for the OS dialer. Visual separators (spaces, dashes,
 * parentheses) are stripped to the dialable form — a leading `+` is preserved so
 * international numbers still dial. Assumes a dialable value (see hasDialablePhone).
 */
export function telUrlFor(value: string): string {
  const keepsPlus = value.trim().startsWith('+');
  const digits = value.replace(/\D/g, '');
  return `tel:${keepsPlus ? '+' : ''}${digits}`;
}
