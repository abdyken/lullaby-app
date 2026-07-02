/**
 * classifyScope — the broader Reassure scope classifier (v1.5).
 *
 * Deterministic, keyword-based, PURE. It runs ONLY on non-red-flag asks that a
 * curated KB comfort topic did not already answer (see router.ts route()), and it
 * NEVER decides triage — the red-flag scan happens first, in code, before this is
 * ever called. classifyScope is the single source of "what kind of
 * parent-experience question is this?", so the future safe AI path
 * (reassure-parent-answer, still DARK) and the local router agree on scope.
 *
 * No LLM participates. No React / Pro / speech / backend imports — this is a pure
 * leaf, smoke-guarded like the rest of domain/ (§X14) and mirror-able to Deno.
 *
 * Input contract: `text` is expected already normalized (lowercase, straight
 * apostrophes) exactly like matchesRedFlag — router.ts passes normalizeAsk(t). We
 * lowercase defensively so direct callers/tests can't get a surprising answer.
 */

import type { ReassureScope, ScopeContext } from './types';

const includesAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((n) => haystack.includes(n));

/**
 * Guidance signals — "what is NORMAL / what SHOULD happen" phrasing. Their
 * presence means an ask is asking for guidance, not a read-back of the parent's
 * own saved numbers, so it must NOT be treated as logs_summary even if it also
 * contains "how many".
 */
const GUIDANCE_SIGNALS = [
  'normal',
  'should',
  'typical',
  'average',
  'supposed',
  'enough',
  'is it ok',
  'is this ok',
  'is that ok',
  'how often',
] as const;

/** Read-back of the parent's OWN logged data ("how many feeds tonight?"). */
const LOGS_READBACK = [
  'how many',
  'how much',
  'so far',
  'summary',
  'recap',
  'total',
  'count',
  'what did',
  'what has',
  'how did she',
  'how did he',
  'did she have',
  'did he have',
  'last feed',
  'when did she',
  'when did he',
] as const;

/** How-to for using the app / where a thing gets logged. */
const APP_LOGGING = [
  'what should i log',
  'what do i log',
  'how do i log',
  'how to log',
  'where do i log',
  'log this',
  'log it',
  'log that',
  'how do i track',
  'how do i record',
  'how do i add',
  'where do i put',
  'which category',
  'what category',
  'categori',
  'log a feed',
  'log a diaper',
  'log a sleep',
  'log a pump',
  'use the app',
] as const;

const FEEDING = [
  'feed',
  'feeding',
  'eating',
  'eats',
  'hungr',
  'milk',
  'bottle',
  'breast',
  'nurs',
  'latch',
  'formula',
  'cluster',
  'ounce',
] as const;

const DIAPER = [
  'diaper',
  'nappy',
  'poop',
  'poo',
  'pee',
  'stool',
  'bowel',
  'dirty',
  'meconium',
  'wet diaper',
  'wet nappy',
] as const;

const SLEEP = ['sleep', 'nap', 'bedtime', 'wake window', 'drowsy', 'overtired', 'swaddle'] as const;

/** Parent-experience distress — handled as NON-medical support. */
const PARENT_SUPPORT = [
  'exhaust',
  'overwhelm',
  'burnt out',
  'burned out',
  'so tired',
  "i'm tired",
  'im tired',
  'no sleep for me',
  'cant do this',
  "can't do this",
  'cant cope',
  "can't cope",
  'breaking down',
  'at my limit',
  'losing it',
  'so hard',
  'stressed',
  'anxious',
  'i need a break',
  'failing',
  'bad mom',
  'bad mum',
  'bad parent',
  'give up',
  'touched out',
] as const;

/** General baby worry with no curated topic — LOCAL: out of scope; FUTURE: AI. */
const BABY_COMFORT = [
  'is it normal',
  'is this normal',
  'is that normal',
  'why does she',
  'why does he',
  'why is she',
  'why is he',
  'rash',
  'spots',
  'sneez',
  'startle',
  'twitch',
  'cold hands',
  'blotch',
  'cradle cap',
  'snuffl',
  'congest',
] as const;

/**
 * Classify a non-red-flag, non-curated-topic ask into one broad scope. Order
 * matters: the first matching bucket wins. `ctx.hasLogs` gates logs_summary — a
 * read-back ask with nothing saved yet has nothing to summarize, so it is out of
 * scope rather than a hollow "your logs" card.
 */
export function classifyScope(text: string, ctx: ScopeContext = { hasLogs: false }): ReassureScope {
  const s = text.toLowerCase();

  // 1) Read-back of the parent's own logs — but not if it's really a guidance ask.
  if (!includesAny(s, GUIDANCE_SIGNALS) && includesAny(s, LOGS_READBACK)) {
    return ctx.hasLogs ? 'logs_summary' : 'out_of_scope';
  }
  // 2) How-to: what/where to log in the app.
  if (includesAny(s, APP_LOGGING)) return 'app_logging_help';
  // 3) Feeding / diaper / sleep tracking questions.
  if (includesAny(s, FEEDING)) return 'feeding_tracking';
  if (includesAny(s, DIAPER)) return 'diaper_tracking';
  if (includesAny(s, SLEEP)) return 'sleep_tracking';
  // 4) Parent-experience support (non-medical).
  if (includesAny(s, PARENT_SUPPORT)) return 'parent_support';
  // 5) A general baby worry we have no curated topic for (future AI answer).
  if (includesAny(s, BABY_COMFORT)) return 'baby_comfort';
  // 6) Genuinely outside what Reassure covers.
  return 'out_of_scope';
}
