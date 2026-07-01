/**
 * Red-flag substrings — the triage guardrail checked FIRST on every input.
 *
 * ⚠️ CLINICIAN-OWNED CONTENT — PLACEHOLDER, PENDING CLINICIAN REVIEW.
 * This list is ported verbatim from .reference/reassure-demo.html. It must be
 * validated by a clinician before any public launch (see
 * docs/reassure-content-review.md and REASSURE_CONTENT in content/kb.ts).
 * Do not edit the list without adding a review-log entry.
 *
 * Engineering owns the MATCHING SEMANTICS (lowercase substring match over
 * normalized input — see router.ts normalizeAsk); the clinician owns the
 * MEMBERSHIP. Substring matching deliberately over-triggers ("her temperature
 * is normal" → triage): the false positive direction is over-caution, which is
 * the safe direction for a 2am safety surface.
 *
 * PURE LEAF: zero imports. Keep it that way — this module is mirrored into the
 * Supabase edge functions (supabase/functions/_shared/reassureContent.ts) and
 * a smoke-runner checksum guard asserts the two copies never drift.
 */

export const REDFLAGS = [
  'fever',
  'feels hot',
  'really hot',
  'burning up',
  'temperature',
  "won't wake", // typographic-apostrophe input is normalized to this form in router.ts
  'wont wake',
  "can't wake",
  'cant wake',
  'hard to wake',
  'not waking',
  'unresponsive',
  'limp',
  'floppy',
  'turning blue',
  'blue lips',
  'dusky',
  'not breathing',
  'trouble breathing',
  'struggling to breathe',
  "can't breathe",
  'gasping',
  'choking',
  'seizure',
  'convulsion',
  'blood',
  'bloody',
  'projectile',
  'green vomit',
  'dehydrat',
  'no wet diaper',
  'no wet diapers',
  'sunken',
] as const;

/**
 * True when the (already normalized — lowercase, straight apostrophes) text
 * contains any red-flag substring. Callers must normalize first; router.ts is
 * the only intended caller in the app.
 */
export function matchesRedFlag(normalizedText: string): boolean {
  return REDFLAGS.some((flag) => normalizedText.includes(flag));
}
