/**
 * Pro feature gates — pure predicates for the Pro v1 features.
 *
 * Each gate answers "does this caregiver's entitlement unlock this feature?" from
 * a single `isPro` boolean, so the gating rule lives in ONE dependency-free leaf
 * (no React, no env, no network) that both the UI and the smoke test can call.
 * See docs/plans/pro-implementation-plan.md §7.
 *
 * HARD RULE — core logging is NEVER gated. Feed / Sleep / Diaper / Pump, the
 * Tonight loop, onboarding, and the first log stay free for everyone. These gates
 * only ever hide DEPTH and EXPORT (history beyond the free window, weekly-recap
 * export, the pediatrician summary) — never input. Core logging files must not
 * import this module (enforced in scripts/check-local-interactions.ts).
 */

/** Export / share the weekly recap — plain TEXT via the OS share sheet (a
 * formatted PDF/CSV does not exist; never advertise one). Pro-only. */
export function canExportWeeklyRecap(isPro: boolean): boolean {
  return isPro;
}

/** View history beyond the free 7-day window. Pro-only. */
export function canViewFullHistory(isPro: boolean): boolean {
  return isPro;
}

/**
 * View the extended 30-day rhythm insights with real computed trends. Pro-only.
 * The free 7-day Insights view stays free for everyone — this gates only the
 * longer window and its trend analysis (depth, never input).
 */
export function canViewExtendedInsights(isPro: boolean): boolean {
  return isPro;
}

/** Generate / share the clean, descriptive pediatrician summary. Pro-only. */
export function canSharePediatricianSummary(isPro: boolean): boolean {
  return isPro;
}

/**
 * The LLM-phrased Reassure night read (Phase 2). Pro-only — this gates POLISH,
 * never safety: the triage router, curated answers, and the code-computed
 * recap/tallies stay free for everyone (Reassure's domain/content modules are
 * forbidden from importing this file — enforced in the smoke test §X).
 */
export function canUseLlmNightRead(isPro: boolean): boolean {
  return isPro;
}

/**
 * Add EXTRA caregivers (the 3rd+, e.g. a read-only grandparent) — a FUTURE gate.
 *
 * Open for now (returns true regardless of `isPro`) so Phase 1 changes nothing
 * about the caregiver flow. When this gate goes live it will restrict only the
 * 3rd+ invite. The `isPro` argument is part of the stable signature for that day.
 *
 * The FIRST caregiver invite — the two-person night-shift pair the whole app is
 * built around — MUST ALWAYS REMAIN FREE and is never routed through this gate.
 * The invite flow deliberately does not import proGates (enforced by the smoke
 * test), so the first invite can never accidentally become gated.
 */
export function canAddExtraCaregivers(isPro: boolean): boolean {
  return true;
}
