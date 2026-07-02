/**
 * The Reassure router — every input (voice transcript, example chip, typed
 * text) resolves through this ONE function into exactly one bounded outcome.
 *
 * Semantics are ported verbatim from .reference/reassure-demo.html `route()`:
 *   1. RED FLAGS FIRST. If any red-flag substring matches, return triage —
 *      before and regardless of any topic match. Safety overrides comfort.
 *   2. Topic regexes (hiccups → spit-up → gas → crying → sleep). Crying &
 *      settling owns cry/fuss/scream/soothe/settle so those asks land on the
 *      dedicated comfort card rather than the sleep card.
 *   3. Otherwise out-of-scope — a polite bounded decline.
 *
 * The red-flag check preceding the first topic regex is asserted by a
 * source-scan in scripts/check-local-interactions.ts §X, so "triage always
 * wins" cannot silently regress.
 *
 * English-only: the matching vocabulary is English. Non-English input falls
 * through to 'oos' (a bounded decline) — never a wrong answer. Voice input is
 * pinned to en-US (see application/useVoiceInput.ts).
 *
 * PURE LEAF: no react/react-native imports; only sibling domain imports.
 */

import { matchesRedFlag } from './redflags';
import type { RouteResult } from './types';

/**
 * Lowercase, map typographic apostrophes (’ ‘) to straight ones, and trim.
 * iOS keyboards and speech-to-text emit ’ — without this, "won’t wake" would
 * never match the red-flag list.
 */
export function normalizeAsk(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").trim();
}

/** Route a parent's question. See module header for the contract. */
export function route(text: string): RouteResult {
  const t = normalizeAsk(text);
  // 1) Triage guardrail — FIRST, always. Never move a topic match above this.
  if (matchesRedFlag(t)) return { kind: 'triage' };
  // 2) Curated topics (demo order and demo regexes, verbatim).
  if (/hiccup/.test(t)) return { kind: 'topic', key: 'hiccups' };
  if (/spit|posset|throw up|throwing up|vomit/.test(t)) return { kind: 'topic', key: 'spitup' };
  if (/gas|grunt|squirm|wriggl|fart|wind|colic|tummy/.test(t)) return { kind: 'topic', key: 'gas' };
  // Crying & settling — a core newborn-night worry. Owns settle/fuss (moved out
  // of the sleep regex below) so "won't settle" and "fussy tonight" land here.
  if (/cry|fuss|scream|sooth|settle|inconsolable|upset/.test(t)) {
    return { kind: 'topic', key: 'crying' };
  }
  if (/sleep|nap|won'?t sleep|wont sleep|restless|awake/.test(t)) {
    return { kind: 'topic', key: 'sleep' };
  }
  // 3) Bounded decline.
  return { kind: 'oos' };
}
