/**
 * isInfantMedical — the THIRD deterministic safety gate (after infant red-flags
 * and parent-crisis). It answers one question: "is this a question about the
 * BABY's health/body/symptoms?" If so, the ask is gated to the pediatrician
 * redirect and NEVER reaches the AI companion — infant-medical guidance stays
 * clinician-owned and behind sign-off.
 *
 * This is the block-list that makes the broad companion safe: after the three
 * gates strip everything infant-medical, the remainder (the parent's feelings,
 * relationship, routine, self-doubt) is what may reach the model. The support
 * system prompt is only a BACKSTOP for anything that slips through here.
 *
 * ⚠️ CLINICIAN / SAFETY-OWNED CONTENT — PLACEHOLDER, PENDING REVIEW
 * (docs/plans/reassure-content-review.md, under REASSURE_CONTENT).
 *
 * Matching is lowercase substring over normalized input (like matchesRedFlag).
 * Over-triggering is the safe direction: a borderline ask gated to "ask your
 * pediatrician" is safer than one sent to the companion. Terms are kept
 * infant-oriented (multi-word where a bare word would over-match parent talk).
 *
 * PURE LEAF: zero imports. Mirrored into the Supabase edge functions
 * (supabase/functions/_shared/reassureContent.ts); a smoke deep-equal guards drift.
 */

/**
 * Infant health / symptom / body terms. Deliberately NOT a superset of every
 * word — just enough clearly-infant-medical language that an ask containing one
 * is about the baby's body, not the parent's feelings.
 */
export const INFANT_MEDICAL_TERMS = [
  // skin / appearance
  'rash',
  'hives',
  'eczema',
  'cradle cap',
  'jaundice',
  'jaundiced',
  'yellow skin',
  'yellowish',
  'looks yellow',
  'blotchy',
  'birthmark',
  'peeling skin',
  'dry skin',
  'diaper rash',
  'nappy rash',
  // eyes / ears / nose / mouth
  'eye discharge',
  'goopy eye',
  'pink eye',
  'pinkeye',
  'ear infection',
  'her ear',
  'his ear',
  'earache',
  'stuffy nose',
  'runny nose',
  'congested',
  'congestion',
  'mucus',
  'phlegm',
  'snot',
  'teething',
  'her gums',
  'his gums',
  'a tooth',
  // gut / feeding-body
  'vomit',
  'throwing up',
  'throw up',
  'diarrhea',
  'diarrhoea',
  'constipated',
  'constipation',
  'reflux',
  'colic',
  'stool',
  'poop color',
  'poop colour',
  'green poop',
  'bloody stool',
  'spit up blood',
  // growth / feeding-amounts / general infant health
  'gaining weight',
  'not gaining',
  'losing weight',
  'her weight',
  'his weight',
  'baby weight',
  'how many ounces',
  'how much formula',
  'how much milk should',
  'umbilical',
  'belly button',
  'cord stump',
  'circumcision',
  'swollen',
  'a lump',
  'a fever', // fever itself is also a red flag; harmless overlap
  'temperature reading',
  'is she sick',
  'is he sick',
  'is the baby sick',
] as const;

/**
 * True when the (already normalized) text reads as a question/statement about
 * the baby's health or body. Callers normalize first, like the other gates.
 */
export function isInfantMedical(normalizedText: string): boolean {
  return INFANT_MEDICAL_TERMS.some((term) => normalizedText.includes(term));
}
