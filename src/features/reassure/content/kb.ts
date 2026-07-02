/**
 * Reassure curated knowledge base — the ONLY place topic answers come from.
 *
 * ⚠️ CLINICIAN-OWNED CONTENT — PLACEHOLDER, PENDING CLINICIAN REVIEW.
 * Every string in this module is ported verbatim from
 * .reference/reassure-demo.html and is a placeholder until a clinician signs
 * it off (see docs/reassure-content-review.md). REASSURE_CONTENT.status stays
 * 'draft' until then; the release checklist blocks a public launch on
 * status === 'approved'. Do not edit copy without a review-log entry.
 *
 * Answers are BOUNDED by construction: each topic carries exactly
 * what's-normal / what-helps / when-to-call, and every rendered answer
 * terminates in "it's normal" or "call a doctor". There is no open-ended
 * content shape.
 *
 * PURE LEAF: type-only imports. Mirrored into the Supabase edge functions
 * (supabase/functions/_shared/reassureContent.ts) with a smoke-runner
 * checksum guard against drift.
 */

import type { ReassureTopicKey } from '../domain/types';

export type ReassureTopicTag = 'Common' | 'Comfort';

export type ReassureTopic = {
  key: ReassureTopicKey;
  title: string;
  tag: ReassureTopicTag;
  /** the one-line calm summary shown in the answer header and accordion row */
  line: string;
  /** "What's normal" block */
  normal: string;
  /** "What can help" block */
  helps: string;
  /** "When to call" block */
  call: string;
};

/* PLACEHOLDER — pending clinician review (all four topics). */
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
    title: 'Gas & burping',
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

export const TOPIC_ORDER: ReassureTopicKey[] = ['hiccups', 'spitup', 'gas', 'crying', 'sleep'];

/* PLACEHOLDER — pending clinician review. */
export const TRIAGE_COPY = {
  title: "This one's worth a real person",
  tag: 'Please call',
  line: "What you're describing can need more than an app.",
  call: "Call your pediatrician now. If baby is struggling to breathe, can't be woken, or is turning blue, call your local emergency number right away.",
  primaryAction: 'Call pediatrician',
  secondaryAction: 'Local emergency number',
  dismiss: 'Close',
} as const;

/* PLACEHOLDER — pending clinician review. */
export const OOS_COPY = {
  title: "That's outside what I answer",
  tag: 'Bounded',
  line: 'I keep to common newborn-night worries — feeding, spit-up, gas, hiccups, and sleep.',
  foot: "For anything else, or if you're simply not sure, your pediatrician is the right call.",
  dismiss: 'Got it',
} as const;

/* PLACEHOLDER — pending clinician review. */
export const TOPIC_FOOT = "Still worried after this? Trust your gut — it's always okay to call your doctor.";
export const TOPIC_DISMISS = 'Got it, thanks';

export type ExampleChip = {
  /** short chip label shown in the ask card */
  label: string;
  /** the full ask sent through route() when tapped */
  ask: string;
  /** red ⚑ styling — the chip demonstrates the triage path */
  flagged: boolean;
};

/* PLACEHOLDER — pending clinician review (chips demonstrate real asks). */
export const EXAMPLE_CHIPS: ExampleChip[] = [
  { label: 'Hiccups after feeds', ask: 'She hiccups after every feed', flagged: false },
  { label: 'Spit-up after a feed', ask: 'A little spit-up after feeding', flagged: false },
  { label: 'Grunting & squirming', ask: 'Lots of grunting and squirming', flagged: false },
  { label: 'Burping after feeds', ask: 'She burps a lot after feeds', flagged: false },
  { label: "Won't stop crying", ask: "She won't stop crying", flagged: false },
  { label: "Won't settle", ask: "She won't settle at all", flagged: false },
  { label: 'She feels hot', ask: 'She feels really hot', flagged: true },
  { label: 'Hard to wake her', ask: "She's hard to wake", flagged: true },
];

/**
 * Review metadata — the launch gate. Reassure ships publicly only when
 * status === 'approved' (release checklist + docs/reassure-content-review.md).
 */
export const REASSURE_CONTENT = {
  version: '2026-07-02',
  status: 'draft' as 'draft' | 'approved',
  reviewedBy: null as string | null,
  reviewedAt: null as string | null,
} as const;
