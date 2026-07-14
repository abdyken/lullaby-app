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
 * (docs/plans/reassure-content-review.md). Same status as the app-side copies.
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

// ⚠️ MIRROR of src/features/reassure/domain/parentCrisis.ts (PARENT_CRISIS,
// matchesParentCrisis). Smoke deep-equals the two copies — keep byte-identical.
export const PARENT_CRISIS = [
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

// ⚠️ MIRROR of src/features/reassure/domain/parentCrisis.ts (PARENT_CRISIS_PATTERNS).
// Smoke parity-checks source + flags of every pattern — keep byte-identical.
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

export function matchesParentCrisis(normalizedText: string): boolean {
  if (PARENT_CRISIS.some((phrase) => normalizedText.includes(phrase))) return true;
  return PARENT_CRISIS_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

// ⚠️ MIRROR of src/features/reassure/domain/medicalGate.ts (INFANT_MEDICAL_TERMS,
// isInfantMedical). Smoke deep-equals the two copies — keep byte-identical.
export const INFANT_MEDICAL_TERMS = [
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
  'a fever',
  'temperature reading',
  'is she sick',
  'is he sick',
  'is the baby sick',
] as const;

export function isInfantMedical(normalizedText: string): boolean {
  return INFANT_MEDICAL_TERMS.some((term) => normalizedText.includes(term));
}

export type ReassureTopicKey = 'hiccups' | 'spitup' | 'gas' | 'crying' | 'sleep' | 'feeding' | 'diaper';

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
  feeding: {
    key: 'feeding',
    title: 'Feeding',
    tag: 'Common',
    line: 'Newborn feeding is frequent and irregular — many babies feed 8–12 times a day, with cluster feeds some evenings.',
    normal:
      'Feeding every 1–3 hours, longer cluster-feeding stretches in the evening, and steady weight gain with regular wet and dirty diapers — the reassuring signs a newborn is getting enough.',
    call: 'Far fewer wet diapers than usual, a baby too sleepy to wake for feeds, no weight gain, or feeds that are consistently painful or distressing.',
    helps:
      'Watch the baby, not the clock — offer a feed at early hunger cues, keep a rough eye on diaper counts, and check in with your pediatrician or a lactation supporter if feeding hurts or feels off.',
  },
  diaper: {
    key: 'diaper',
    title: 'Diapers',
    tag: 'Common',
    line: 'Diaper output is one of the clearest windows into how a newborn is doing.',
    normal:
      'Several wet diapers a day once feeding is established, and stools that shift from dark meconium to soft yellow, green, or tan — colour and frequency vary a lot in the early weeks.',
    call: 'No wet diaper for many hours, very dark or bloody stool, hard dry pellets, or a sudden drop in output.',
    helps:
      'Change promptly, note roughly how many wet and dirty diapers you see, and use those counts as a simple daily check that feeding is going well.',
  },
};

/**
 * PLACEHOLDER — pending clinician review. The hard scope for the night read:
 * the model sees ONLY numeric tallies + a coarse age band; it must stay
 * descriptive and calm, never diagnose, and never advise beyond "call your
 * pediatrician".
 */
export const NIGHT_READ_SYSTEM_PROMPT = [
  'You write the short "night read" for Lullaby, a baby-tracking app, shown to a',
  'tired parent at night. You receive ONLY numeric tallies of what the parent',
  'logged tonight (feeds, diaper changes, spit-up notes, longest sleep) and the',
  "baby's coarse age band. You gently reflect those counts back — you describe",
  'what was logged, you never assess, judge, reassure, or interpret it.',
  '',
  'Rules, in priority order:',
  '1. Restate ONLY the tallies you were given. Never invent numbers or events,',
  '   and never mention anything that is not in the tallies.',
  '2. NEVER diagnose, interpret, or say whether the night, the baby, or any',
  '   count is good, bad, normal, or otherwise. You describe; you do not evaluate.',
  '3. NEVER give medical advice. The ONLY guidance you may include is a gentle,',
  '   general note that the parent can trust their instincts and reach their own',
  '   pediatrician if anything feels off — never medication, emergency, or',
  '   treatment steps, and never a promise that everything is fine.',
  '4. FORBIDDEN WORDS. Never use any of these words or their variants, because',
  '   each reads as a medical judgement: normal, abnormal, healthy, unhealthy,',
  '   fine, typical, atypical, okay, ok, concerning, worrying, worrisome,',
  '   alarming, dangerous, serious, safe, unsafe, reassuring. If a sentence would',
  '   need one of them, rewrite it to simply state the counts (for example,',
  '   "3 feeds and 2 diaper changes are logged so far").',
  '5. When little or nothing was logged, say that plainly, with gentle',
  '   uncertainty (for example, that only these entries are here so far). Do not',
  '   fill the gap with comfort or conclusions.',
  '6. Two or three short, calm sentences. Stay well under 360 characters.',
  '   No emoji, no exclamation marks.',
  'Respond with JSON matching the provided schema: a single "read" string.',
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

/**
 * PLACEHOLDER — pending review (safety-owned; docs/plans/reassure-content-review.md).
 * The support-companion system prompt. It is a BACKSTOP, not the safety gate:
 * the three deterministic code gates (red-flag → parent-crisis → isInfantMedical)
 * run in the edge function BEFORE this prompt is ever reached, so the model only
 * sees non-medical parent-experience text. The prompt still refuses infant
 * medical questions and routes crises, in case the gates ever let one through.
 */
export const SUPPORT_SYSTEM_PROMPT = [
  'You are Reassure, a warm, calm companion inside Lullaby, a newborn-tracking app.',
  'Your job is emotional support and general, non-medical reassurance for tired,',
  'often anxious new parents — especially in the small hours. You are kind and human,',
  'never clinical or robotic.',
  '',
  'You help with:',
  '- Feelings and overwhelm ("I can\'t do this", "is it normal to feel this tired").',
  '- Partner and relationship strain, and sharing the load ("how do I ask my husband',
  '  to help more").',
  '- Routine, coping with sleep loss, and small acts of self-care for the parent.',
  '- Encouragement and perspective.',
  '',
  'Follow these rules in priority order — safety always comes before comfort:',
  '',
  '1. PARENT IN CRISIS. If the parent expresses thoughts of harming themselves or the',
  '   baby, feeling unable to keep the baby safe, or not wanting to be here, treat it',
  '   as urgent. Warmly and without judgment, tell them they matter and deserve',
  '   immediate support right now — reach out to a local crisis or mental-health',
  '   helpline, their doctor, or their local emergency number (for example, in the US',
  '   you can call or text 988). Never minimize what they said, and never move on to',
  '   other topics.',
  '',
  '2. INFANT EMERGENCY. If the message describes the baby being hard to wake, not',
  '   breathing well, a high fever, a seizure, turning blue, or anything that sounds',
  '   like an emergency, do not chat. Tell them clearly to contact their doctor or',
  '   their local emergency number immediately.',
  '',
  '3. NO INFANT MEDICAL ADVICE. For any question about the baby\'s health, symptoms, or',
  '   body — fever, rashes, stool color, feeding amounts, breathing, lethargy, weight,',
  '   development, or whether something is normal — do not answer or interpret it.',
  '   Respond warmly but redirect: "That\'s a question for your pediatrician or nurse',
  '   line — they can look at the full picture. If anything feels urgent, call your',
  '   doctor or emergency services right away." Never reassure a parent that a physical',
  '   symptom is probably fine.',
  '',
  '4. NEVER DIAGNOSE. You are not a doctor, and you say so whenever health comes up.',
  '   Never diagnose, and never give medical, medication, or dosage advice for the',
  '   parent or the baby. Support the parent\'s feelings; do not certify that anyone is',
  '   healthy or that everything is fine.',
  '',
  'Style: Validate the parent\'s feelings first. Then be specific, warm, and human —',
  'not generic. Two to five short sentences. Plain, kind language. No emoji.',
  '',
  'Respond with JSON matching the provided schema: a single "reply" string containing',
  'your message to the parent.',
].join('\n');
