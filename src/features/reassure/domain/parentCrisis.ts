/**
 * Parent-crisis substrings — the SECOND deterministic safety gate, checked right
 * after the infant red-flag scan and before any topic/scope classification or
 * model call (see router.ts route() and the reassure-support edge function).
 *
 * This is the parent's OWN safety: thoughts of self-harm, of harming the baby,
 * of being unable to keep the baby safe, or of not wanting to be here. A match
 * routes to the free crisis card (kind:'crisis') — never the AI companion, never
 * a paywall. Like the infant red-flags, safety lives in CODE around the model,
 * not in the prompt.
 *
 * ⚠️ CLINICIAN / SAFETY-OWNED CONTENT — PLACEHOLDER, PENDING REVIEW.
 * Ported into REASSURE_CONTENT's review manifest (docs/plans/reassure-content-review.md).
 * Engineering owns the MATCHING SEMANTICS (lowercase substring match over
 * normalized input — see router.ts normalizeAsk); a reviewer owns MEMBERSHIP.
 * Substring matching deliberately over-triggers: the false-positive direction
 * (showing crisis resources when not strictly needed) is the safe direction.
 *
 * PURE LEAF: zero imports. Keep it that way — this module is mirrored into the
 * Supabase edge functions (supabase/functions/_shared/reassureContent.ts) and a
 * smoke-runner deep-equal guard asserts the two copies never drift.
 */

export const PARENT_CRISIS = [
  // self-harm / suicidal ideation
  'kill myself',
  'killing myself',
  'end my life',
  'ending my life',
  'take my own life',
  'hurt myself',
  'harm myself',
  'suicidal',
  'suicide',
  'want to die',
  'wish i was dead',
  'wish i were dead',
  "don't want to be here",
  'dont want to be here',
  'do not want to be here',
  "can't go on",
  'cant go on',
  'no reason to live',
  'better off without me',
  'everyone would be better off without me',
  // harming the baby / unable to keep the baby safe
  'hurt the baby',
  'hurt my baby',
  'harm the baby',
  'harm my baby',
  'kill the baby',
  'shake the baby',
  'shake my baby',
  'might hurt the baby',
  'might hurt her',
  'might hurt him',
  'afraid i might hurt',
  'scared i might hurt',
  'afraid i will hurt',
  "can't keep her safe",
  "can't keep him safe",
  "can't keep the baby safe",
  "can't keep my baby safe",
  'cant keep her safe',
  'cant keep him safe',
  'cant keep the baby safe',
  'cant keep my baby safe',
  'unable to keep the baby safe',
] as const;

/**
 * Indirect / paraphrased crisis language — regex patterns for how people in
 * postpartum crisis actually speak, beyond the explicit PARENT_CRISIS substrings.
 * RECALL-BIASED on purpose: a false positive only surfaces a helpline (safe),
 * while a miss is far worse. Patterns run over the SAME normalized text
 * (lowercase, straight apostrophes), so they are written lowercase and are
 * NON-GLOBAL (no `g` flag) so `.test()` stays stateless. Bounded quantifiers
 * only (no nested unbounded repeats) to avoid catastrophic backtracking.
 *
 * ⚠️ Mirrored byte-identically into supabase/functions/_shared/reassureContent.ts;
 * a smoke pattern-source/flags parity guard asserts the two copies never drift.
 */
export const PARENT_CRISIS_PATTERNS: readonly RegExp[] = [
  // — Passive / indirect suicidal ideation —
  /what'?s the point$/,
  /what'?s the point (anymore|of (it all|living|this|any of this|going on|even trying|carrying on|life|getting up|waking up|being here))/,
  /(don'?t|do not|dont) want to (wake up|be alive|live|exist|go on|keep going|be here anymore)/,
  /(wish|wishing) i (was|were|wasn'?t|wasnt) (dead|gone|never born|not here|asleep forever)/,
  /(want|wanting) (it|this|everything|it all) to (end|stop|be over)/,
  /(want|wanting) to (go to sleep|sleep) and (not|never) wake up/,
  /no reason to (live|go on|keep going|be here|get up|wake up)/,
  /tired of (being alive|living|being here|waking up|existing)/,
  /better off (without me|if i (was|were|am|wasn'?t) ?(gone|not here|dead|not around|never born)?)/,
  /can'?t do this anymore/,
  // — Fear of harming the baby / intrusive thoughts —
  // "I'll hurt him", "scared I'll hurt her", "want to hurt the baby" (excludes "hurt her feelings").
  /\b(hurt|hurting|harm|harming)\b[^.?!]{0,12}\b(the baby|my baby|the babies|baby|him|her|them)\b(?!\s*feelings)/,
  // drop/shake/smother/throw the baby — baby-specific object so accidental "dropped her bottle" is excluded.
  /\b(drop|dropping|shake|shaking|smother|smothering|throw|throwing|hit|hitting)\b[^.?!]{0,12}\b(the baby|my baby|the babies)\b/,
  // explicit intent to harm "on purpose" (any object)
  /\b(drop|shake|hurt|harm|throw|smother|hit)\b[^.?!]{0,20}on purpose/,
  // intrusive-thoughts framing
  /thoughts (i|that i)? ?(don'?t|do not|dont) want to (have|think|be having)/,
  /(intrusive|scary|dark|violent|bad|awful|terrible|disturbing|horrible|weird) thoughts/,
  /thoughts (about|of) (hurting|harming|dropping|shaking|the baby)/,
  // — Inability to keep the baby safe / can't be trusted —
  /(scared|afraid|frightened|terrified|worried|nervous|anxious) to be (alone|left alone|by myself) with (the baby|my baby|him|her|them|the babies)/,
  /(can'?t|cannot|shouldn'?t|should not) be (trusted|left)[^.?!]{0,15}(with|around|near|alone with)[^.?!]{0,12}(the baby|my baby|him|her|them|the babies)/,
  /(don'?t|do not|dont|can'?t|cannot) trust myself/,
  /(can'?t|cannot) keep (her|him|them|the baby|my baby|the babies|myself|us) safe/,
  // — Wanting to escape / abandon —
  /what if i (just )?(walk|walked|leave|left|disappear|ran|run|running|walk out|get away)/,
  /(want|wanting|going) to (run away|disappear|vanish|escape)/,
  /(want|wanting) to (just )?(leave|walk out|get away|drive away)( and never (come back|return))?/,
  /(walk|walked|walking|run|ran|drive|drove) away from (it all|them|the baby|everything|my life|being a|my kids|my family|this)/,
  /(leave|leaving|abandon|abandoning) (the baby|them|my baby|my kids|my family|everything) (behind|forever|for good)/,
];

/**
 * True when the (already normalized — lowercase, straight apostrophes) text
 * matches ANY explicit crisis substring OR indirect crisis pattern. Callers MUST
 * normalize first, exactly like matchesRedFlag; router.ts passes normalizeAsk(t).
 */
export function matchesParentCrisis(normalizedText: string): boolean {
  if (PARENT_CRISIS.some((phrase) => normalizedText.includes(phrase))) return true;
  return PARENT_CRISIS_PATTERNS.some((pattern) => pattern.test(normalizedText));
}
