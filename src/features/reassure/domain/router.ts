/**
 * The Reassure router — every input (voice transcript, example chip, typed
 * text) resolves through this ONE function into exactly one bounded outcome.
 *
 * Layering (v1.5 — see docs/reassure-scope-matrix.md):
 *   1. RED FLAGS FIRST. If any red-flag substring matches, return triage —
 *      before and regardless of anything below. Safety overrides everything, and
 *      no classifier or model is consulted before this. Triage is code-only.
 *   2. Curated MEDICAL comfort topics via fixed regexes (hiccups → spit-up → gas
 *      → crying → sleep). Crying & settling owns cry/fuss/scream/soothe/settle;
 *      gas owns burp/belch/wind.
 *   3. Broader scope classifier (classifyScope, deterministic keyword code) for
 *      every other non-red-flag ask → a bounded local outcome: the feeding/diaper
 *      tracking KB topics, a non-medical guide (app help / parent support / logs),
 *      or out-of-scope. The (future, DARK) AI answer path would slot in here for
 *      baby_comfort asks with no curated topic — never above triage.
 *   4. Otherwise out-of-scope — a polite bounded decline.
 *
 * The red-flag check preceding the first topic regex is asserted by a
 * source-scan in scripts/check-local-interactions.ts §X, so "triage always
 * wins" cannot silently regress. classifyScope NEVER decides triage.
 *
 * English-only: the matching vocabulary is English. Non-English input falls
 * through to 'oos' (a bounded decline) — never a wrong answer. Voice input is
 * pinned to en-US (see application/useVoiceInput.ts).
 *
 * PURE LEAF: no react/react-native imports; only sibling domain imports.
 */

import { matchesRedFlag } from './redflags';
import { classifyScope } from './scope';
import type { RouteResult, ScopeContext } from './types';

/**
 * Lowercase, map typographic apostrophes (’ ‘) to straight ones, and trim.
 * iOS keyboards and speech-to-text emit ’ — without this, "won’t wake" would
 * never match the red-flag list.
 */
export function normalizeAsk(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").trim();
}

/**
 * Route a parent's question. See module header for the contract. `ctx.hasLogs`
 * lets a "how many feeds tonight?" ask resolve to the logs guide only when there
 * is something saved to point at; it defaults to false so existing callers and
 * voice candidate-ranking keep working unchanged.
 */
export function route(text: string, ctx: ScopeContext = { hasLogs: false }): RouteResult {
  const t = normalizeAsk(text);
  // 1) Triage guardrail — FIRST, always. Never move anything above this.
  if (matchesRedFlag(t)) return { kind: 'triage' };
  // 2) Curated MEDICAL comfort topics (demo order and demo regexes, verbatim).
  if (/hiccup/.test(t)) return { kind: 'topic', key: 'hiccups' };
  if (/spit|posset|throw up|throwing up|vomit/.test(t)) return { kind: 'topic', key: 'spitup' };
  // Gas & burping — burp/belch/wind-after-feeds are a common newborn gas/comfort
  // ask (burp/belch added here so "she's burping" lands on the gas card, not oos).
  if (/gas|grunt|squirm|wriggl|fart|wind|colic|tummy|burp|belch/.test(t)) return { kind: 'topic', key: 'gas' };
  // Crying & settling — a core newborn-night worry. Owns settle/fuss (moved out
  // of the sleep regex below) so "won't settle" and "fussy tonight" land here.
  if (/cry|fuss|scream|sooth|settle|inconsolable|upset/.test(t)) {
    return { kind: 'topic', key: 'crying' };
  }
  if (/sleep|nap|won'?t sleep|wont sleep|restless|awake/.test(t)) {
    return { kind: 'topic', key: 'sleep' };
  }
  // 3) Broader parent-experience scope — deterministic keyword classifier, never
  //    a model, always after the triage scan above.
  return mapScope(classifyScope(t, ctx));
}

/** Map a classified scope onto exactly one bounded local outcome. */
function mapScope(scope: ReturnType<typeof classifyScope>): RouteResult {
  switch (scope) {
    case 'feeding_tracking':
      return { kind: 'topic', key: 'feeding' };
    case 'diaper_tracking':
      return { kind: 'topic', key: 'diaper' };
    case 'sleep_tracking':
      return { kind: 'topic', key: 'sleep' };
    case 'app_logging_help':
      return { kind: 'guide', key: 'app_logging_help' };
    case 'parent_support':
      return { kind: 'guide', key: 'parent_support' };
    case 'logs_summary':
      // classifyScope only returns this when ctx.hasLogs, so there is data to point at.
      return { kind: 'guide', key: 'logs_summary' };
    case 'baby_comfort':
      // A general baby worry with no curated topic. LOCAL: bounded decline.
      // FUTURE: the safe AI answer path (reassure-parent-answer) slots in here.
      return { kind: 'oos' };
    case 'out_of_scope':
      return { kind: 'oos' };
  }
}
