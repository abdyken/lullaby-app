/**
 * Reassure domain types — the bounded routing contract.
 *
 * PURE LEAF: no react/react-native imports, no value imports from app modules.
 * Runs under the tsx smoke runner (scripts/check-local-interactions.ts §X).
 *
 * The iron rule encoded here: every ask resolves to EXACTLY ONE of three
 * bounded outcomes. There is no open-ended kind, no follow-up kind, no chat.
 */

/** The curated MEDICAL topics Reassure can answer. Keys index into content/kb.ts KB. */
export type ReassureTopicKey = 'hiccups' | 'spitup' | 'gas' | 'crying' | 'sleep' | 'feeding' | 'diaper';

/**
 * Bounded NON-medical guides. Keys index into content/kb.ts GUIDES. These are
 * app-experience / parent-support answers — deliberately NOT the medical
 * normal/helps/call shape, and never rendered with a "When to call" block.
 */
export type ReassureGuideKey = 'app_logging_help' | 'parent_support' | 'logs_summary';

/**
 * The broader scope classifier's output (v1.5). Produced by classifyScope() for
 * NON-red-flag asks only — it never decides triage. Coarser than a topic key: it
 * says which KIND of parent-experience question this is, so the (future) AI path
 * can pick grounding + prompt, and route() can pick a bounded local outcome.
 */
export type ReassureScope =
  | 'baby_comfort'
  | 'feeding_tracking'
  | 'sleep_tracking'
  | 'diaper_tracking'
  | 'app_logging_help'
  | 'parent_support'
  | 'logs_summary'
  | 'out_of_scope';

/**
 * Context the classifier/router may consult. Kept minimal and code-computed:
 *  - hasLogs — the parent has at least one saved log in the current window, so a
 *    logs_summary ask has something to point at (else it is out of scope).
 */
export type ScopeContext = { hasLogs: boolean };

/**
 * The single result type every input path (voice, chip, text) resolves to.
 *  - 'triage'  — an infant red flag matched; escalate to a doctor. Always wins.
 *  - 'crisis'  — a PARENT-crisis phrase matched (self-harm / harming the baby /
 *                unable to keep baby safe / not wanting to be here). A free,
 *                always-on safety route to crisis resources — never the model,
 *                never a paywall. Decided in code before any topic/scope/Pro check.
 *  - 'topic'   — a curated MEDICAL KB topic answers it, then the interaction ENDS.
 *  - 'guide'   — a bounded NON-medical guide (app help, logs) answered locally.
 *  - 'support' — a non-medical emotional-support ask for the AI companion
 *                (feelings, relationship, routine, self-doubt). The ONLY kind
 *                that may reach Anthropic, and only after the Pro + consent gates
 *                that the screen applies AFTER this classification.
 *  - 'oos'     — out of scope / infant-medical-with-no-topic; politely decline
 *                and point to the pediatrician. Never the model.
 */
export type RouteResult =
  | { kind: 'triage' }
  | { kind: 'crisis' }
  | { kind: 'topic'; key: ReassureTopicKey }
  | { kind: 'guide'; key: ReassureGuideKey }
  | { kind: 'support' }
  | { kind: 'oos' };

/**
 * The reassure-support edge function's response. The server re-runs the same
 * three deterministic safety gates on the raw text BEFORE any model call, so it
 * can return a safety redirect instead of a reply — the client renders that
 * redirect verbatim rather than an AI answer.
 *  - triage / crisis / medical / oos — a code-decided redirect; NO model was called.
 *  - support — the model answered (source:'llm') or every fallback fired
 *              (source:'fallback', reply null → the local support line).
 */
export type SupportResponse =
  | { kind: 'triage' }
  | { kind: 'crisis' }
  | { kind: 'medical' }
  | { kind: 'oos' }
  | { kind: 'support'; reply: string | null; source: 'llm' | 'fallback' };

/** Where an ask came from — analytics-safe enum (never the raw text). */
export type AskSource = 'voice' | 'chip' | 'text';

/** The recap window Reassure grounds its tallies in. */
export type NightWindow = {
  /** inclusive start of the window (ms epoch, local-time derived) */
  startMs: number;
  /** inclusive end of the window (ms epoch) */
  endMs: number;
  /** 'tonight' while live, 'today' for daytime context, 'last-night' for an intentional morning recap */
  label: 'tonight' | 'today' | 'last-night';
};

/** Code-computed tallies over the parent's saved logs for the window. */
export type ReassureNightRecap = {
  window: NightWindow;
  feedCount: number;
  diaperCount: number;
  /** note events whose noteType is spit_up */
  spitUpCount: number;
  /** note events that are not spit-ups */
  otherNoteCount: number;
  /** longest sleep intersecting the window, in whole minutes */
  longestSleepMin?: number;
  /** a sleep with no endAt is running right now */
  sleepRunning: boolean;
  /** nothing logged in the window at all */
  isEmpty: boolean;
};
