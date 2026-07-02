/**
 * Reassure domain types — the bounded routing contract.
 *
 * PURE LEAF: no react/react-native imports, no value imports from app modules.
 * Runs under the tsx smoke runner (scripts/check-local-interactions.ts §X).
 *
 * The iron rule encoded here: every ask resolves to EXACTLY ONE of three
 * bounded outcomes. There is no open-ended kind, no follow-up kind, no chat.
 */

/** The curated topics Reassure can answer. Keys index into content/kb.ts. */
export type ReassureTopicKey = 'hiccups' | 'spitup' | 'gas' | 'sleep';

/**
 * The single result type every input path (voice, chip, text) resolves to.
 *  - 'triage'  — a red flag matched; escalate to a doctor. Always wins.
 *  - 'topic'   — a curated KB topic answers it, then the interaction ENDS.
 *  - 'oos'     — out of scope; politely decline and point to the pediatrician.
 */
export type RouteResult =
  | { kind: 'triage' }
  | { kind: 'topic'; key: ReassureTopicKey }
  | { kind: 'oos' };

/** Where an ask came from — analytics-safe enum (never the raw text). */
export type AskSource = 'voice' | 'chip' | 'text';

/** The recap window Reassure grounds its tallies in. */
export type NightWindow = {
  /** inclusive start of the window (ms epoch, local-time derived) */
  startMs: number;
  /** inclusive end of the window (ms epoch) */
  endMs: number;
  /** 'tonight' while the night is live; 'last-night' for the morning recap */
  label: 'tonight' | 'last-night';
};

/** Code-computed tallies over the parent's saved logs for the window. */
export type ReassureNightRecap = {
  window: NightWindow;
  feedCount: number;
  diaperCount: number;
  /** notes whose meta.label is the Spit-up preset (see recap.ts) */
  spitUpCount: number;
  /** notes that are not spit-ups */
  otherNoteCount: number;
  /** longest sleep intersecting the window, in whole minutes */
  longestSleepMin?: number;
  /** a sleep with no endAt is running right now */
  sleepRunning: boolean;
  /** nothing logged in the window at all */
  isEmpty: boolean;
};
