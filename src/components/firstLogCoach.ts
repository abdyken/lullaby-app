/**
 * First-log coach + Calibrating logic (onboarding Phase 1A, "Personalized
 * Tonight" — roadmap §7E/§7F/§9/§12).
 *
 * Pure, React-free leaf: the phase state machine + the copy builders for the
 * brand-new-night Tonight nudges. No React Native, no AsyncStorage — so the
 * Node/tsx smoke test can cover it directly (the `FirstLogCoach` component owns
 * the side effects: it loads the persisted dismissal, latches the "started
 * empty" observation, and resolves the phase from these helpers).
 *
 * The coach is deliberately one-shot and honest:
 *  - a brand-new parent (zero real events) is gently nudged to log their first
 *    thing ("nudge", pointing down at the quick-log row);
 *  - the moment they log it, the eye is pointed UP at the TonightStatus strip —
 *    the *recurring* "time since last…" value — ("thread");
 *  - it never re-engages a returning parent who already has a timeline, and a
 *    dismissal is permanent.
 */

/** "{name}'s", falling back to "your baby's" for a blank/skip-path name. */
function possessive(name: string): string {
  const trimmed = name.trim() || 'your baby';
  return `${trimmed}'s`;
}

/** Calibrating empty-state line (Napper) — honest, never fake-precise. */
export function tonightCalibratingText(babyName: string): string {
  return `Getting to know ${possessive(babyName)} nights — log a few and the rhythm will fill in.`;
}

/** Coach nudge shown over the quick-log row while nothing is logged yet. */
export function firstLogNudgeText(babyName: string): string {
  return `Tap to log ${possessive(babyName)} first feed — it'll stay on your timeline.`;
}

/**
 * Coach pointer shown right after the first log, aimed UP at the status strip.
 * Event-agnostic on purpose (the lowest-friction first tap is a diaper, not a
 * feed) and not time-bound, so it stays true even if it lingers a moment.
 */
export function firstLogThreadText(): string {
  return "There's your thread — time since the last feed or change shows up here.";
}

export type FirstLogCoachPhase = 'hidden' | 'nudge' | 'thread';

export type FirstLogCoachInput = {
  /** the dismissal flag + the "started empty" observation have both resolved */
  hydrated: boolean;
  /** the parent dismissed the coach (persisted) */
  dismissed: boolean;
  /** there is at least one real logged event (read from the flag-correct store) */
  hasRealEvents: boolean;
  /** this session began before any real log (so the parent just logged the first) */
  startedEmpty: boolean;
};

/**
 * Resolve which coach state to show. Pure + total:
 *  - not hydrated, or dismissed → hidden (never flash before hydration resolves;
 *    the "V2 Tonight must not render before hydration" postmortem)
 *  - zero real events → nudge the first log
 *  - a first event exists AND this session started empty → point at the thread
 *  - otherwise (a returning parent with a timeline) → hidden
 */
export function resolveFirstLogCoachPhase(input: FirstLogCoachInput): FirstLogCoachPhase {
  if (!input.hydrated || input.dismissed) return 'hidden';
  if (!input.hasRealEvents) return 'nudge';
  return input.startedEmpty ? 'thread' : 'hidden';
}

/** AsyncStorage key for the permanent coach dismissal (owned by the component). */
export const FIRST_LOG_COACH_DISMISSED_KEY = 'lullaby.coach.firstLog.v1.dismissed';
