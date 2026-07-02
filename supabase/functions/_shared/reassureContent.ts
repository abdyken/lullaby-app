/**
 * Server-side mirror of the Reassure triage/content modules.
 *
 * ⚠️ GENERATED-BY-HAND MIRROR of:
 *   - src/features/reassure/domain/redflags.ts  (REDFLAGS, matchesRedFlag)
 *   - src/features/reassure/domain/router.ts    (normalizeAsk)
 *   - src/features/reassure/content/kb.ts       (KB, ReassureTopicKey)
 * The smoke runner (§X17 in scripts/check-local-interactions.ts) imports BOTH
 * copies and deep-equals the values — any drift fails the build checks.
 * Deno needs explicit .ts extensions and can't resolve the app's '@/' alias,
 * which is why the mirror exists instead of a cross-tree import.
 *
 * ⚠️ CLINICIAN-OWNED CONTENT — PLACEHOLDER, PENDING CLINICIAN REVIEW
 * (docs/reassure-content-review.md). Same status as the app-side copies.
 */

export const REDFLAGS = [
  'fever',
  'feels hot',
  'really hot',
  'burning up',
  'temperature',
  "won't wake",
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

export function normalizeAsk(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").trim();
}

export function matchesRedFlag(normalizedText: string): boolean {
  return REDFLAGS.some((flag) => normalizedText.includes(flag));
}

export type ReassureTopicKey = 'hiccups' | 'spitup' | 'gas' | 'crying' | 'sleep';

export type ReassureTopic = {
  key: ReassureTopicKey;
  title: string;
  tag: 'Common' | 'Comfort';
  line: string;
  normal: string;
  helps: string;
  call: string;
};

export const KB: Record<ReassureTopicKey, ReassureTopic> = {
  hiccups: {
    key: 'hiccups',
    title: 'Hiccups',
    tag: 'Common',
    line: 'Frequent little hiccups are a normal newborn reflex — they tend to bother us more than the baby.',
    normal:
      'Hiccups after a feed, when excited, or for no clear reason, several times a day — with baby staying comfortable and breathing easily.',
    call: 'They seem to cause pain or choking, come with a lot of vomiting, or get in the way of breathing or feeding.',
    helps: 'Pause, burp, and hold baby upright for a few minutes. They usually stop on their own.',
  },
  spitup: {
    key: 'spitup',
    title: 'Spit-up',
    tag: 'Common',
    line: 'Small spit-ups after feeds are typical while a tiny tummy is still settling.',
    normal:
      "Effortless, small spit-ups after or between feeds, with a content baby who's gaining weight and having wet diapers.",
    call: 'Forceful or projectile vomiting, green or bloody spit-up, poor weight gain, or a baby who seems in pain after most feeds.',
    helps:
      'Smaller, more frequent feeds, burping partway through, and keeping baby upright for 15–20 minutes after.',
  },
  gas: {
    key: 'gas',
    title: 'Gas',
    tag: 'Comfort',
    line: 'Wriggles, grunts, and passing gas are part of a brand-new gut finding its rhythm.',
    normal:
      'Grunting, squirming, pulling legs up, and passing gas — often around feeds — with baby settling again after.',
    call: "A hard, swollen belly with vomiting, no stool plus real distress, or crying that can't be soothed for hours.",
    helps: 'Gentle bicycle legs, tummy time while awake and watched, and burping partway through feeds.',
  },
  crying: {
    key: 'crying',
    title: 'Crying & settling',
    tag: 'Comfort',
    line: 'Crying is how a newborn tells you they need something — lots of fussing, often worse in the evening, is common in the first weeks.',
    normal:
      'Crying or fussing that comes and goes, a more unsettled stretch in the evening, and upset that eases with feeding, holding, a clean diaper, or gentle motion.',
    call: "Crying that is high-pitched, weak, or truly nonstop for hours, a baby who can't be comforted or roused at all, or crying with a fever, breathing trouble, or a change in colour.",
    helps:
      'Work the calm checklist — feed, burp, diaper, warmth, a cuddle — then try skin-to-skin, slow rocking, or a walk. If you feel overwhelmed, it is always okay to put baby down somewhere safe and take a breather.',
  },
  sleep: {
    key: 'sleep',
    title: 'Sleep',
    tag: 'Comfort',
    line: 'Newborn sleep is wonderfully unpredictable — short stretches and mixed-up days and nights are normal early on.',
    normal:
      'Short, irregular sleeps, waking to feed, noisy or twitchy sleep, and day/night confusion in the first weeks.',
    call: 'Baby is very hard to wake, has breathing pauses that worry you, or seems unusually limp or floppy.',
    helps: 'A calm, dark wind-down and the same short routine each night — with safe-sleep basics every time.',
  },
};

/**
 * PLACEHOLDER — pending clinician review. The hard scope for the night read:
 * the model sees ONLY numeric tallies + a coarse age band; it must stay
 * descriptive and calm, never diagnose, and never advise beyond "call your
 * pediatrician".
 */
export const NIGHT_READ_SYSTEM_PROMPT = [
  'You write the two-sentence "night read" for Lullaby, a baby-tracking app,',
  'shown to a tired parent at night. You receive only numeric tallies of what',
  'the parent logged tonight (feeds, diaper changes, spit-up notes, longest',
  'sleep) and the baby\'s coarse age band. Rules, in priority order:',
  '1. NEVER diagnose, interpret symptoms, or assess whether the night is',
  '   normal or abnormal. You restate what was logged, warmly.',
  '2. NEVER give medical advice. The only guidance you may ever include is',
  '   that the parent can always call their pediatrician.',
  '3. Exactly two short, calm, warm sentences. No emoji, no exclamation marks.',
  '4. Mention only the tallies you were given; never invent numbers or events.',
  'Respond with JSON matching the provided schema.',
].join('\n');

/**
 * PLACEHOLDER — pending clinician review. The hard scope for topic polish:
 * the model rephrases ONLY the provided clinician-owned topic content; the
 * triage decision was already made in code before this prompt is reached.
 */
export const TOPIC_POLISH_SYSTEM_PROMPT = [
  'You rephrase one short reassurance line for Lullaby, a baby-tracking app.',
  'You receive a curated, clinician-owned topic entry and the parent\'s own',
  'words. Rules, in priority order:',
  '1. Your answer must contain ONLY information already present in the topic',
  '   entry. You are rephrasing for warmth, not adding knowledge.',
  '2. NEVER diagnose, never assess the specific baby, never give advice that',
  '   is not verbatim in the entry.',
  '3. One or two short, calm sentences that acknowledge the parent\'s wording.',
  '4. If the parent\'s words describe anything urgent or outside the entry,',
  '   respond with the entry\'s original line unchanged.',
  'Respond with JSON matching the provided schema.',
].join('\n');
