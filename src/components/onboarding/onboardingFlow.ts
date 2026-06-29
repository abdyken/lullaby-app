/**
 * onboardingFlow — the pure step reducer behind the personalized setup flow
 * (onboarding Phase 1A foundation, roadmap §12/§13).
 *
 * Deliberately free of React and React Native so it stays a pure leaf the
 * Node/tsx smoke test can exercise directly (like `src/data/localBaby.ts`). The
 * `useOnboardingFlow` hook (`./useOnboardingFlow`) wraps this with `useReducer`;
 * the live screen (next slice) renders one step at a time off `state.step` — never
 * a scroll index (recorded blank-frame postmortem).
 *
 * Steps: `beat` (emotional landing) → `baby` (age + optional name) → `focus`
 * (what help they need tonight) → `nightShift` (caregiver setup) →
 * `nightReassurance` (warm handoff) → `creating` (writing the real local baby)
 * → `done` (reveal Tonight). "Set up later" / early "Skip for now" still create
 * a minimal valid baby; the night-shift skip pauses on the reassurance handoff.
 */
export type OnboardingStep =
  | 'beat'
  | 'baby'
  | 'focus'
  | 'nightShift'
  | 'nightReassurance'
  | 'creating'
  | 'done';

export type OnboardingFlowState = {
  step: OnboardingStep;
};

export type OnboardingFlowAction =
  /** Beat "Begin" → ask about the baby. */
  | { type: 'begin' }
  /** Decision-step "Continue" → baby to focus to nightShift to reassurance to creating. */
  | { type: 'submit' }
  /** "Set up later" / "Skip for now"; night-shift skip still shows reassurance. */
  | { type: 'skip' }
  /** Local baby written + seed cleared → reveal Tonight. */
  | { type: 'created' }
  /** Back out of the current decision step. */
  | { type: 'back' }
  /** Return to the first step (e.g. a dev reset / re-run). */
  | { type: 'reset' };

export const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] = [
  'beat',
  'baby',
  'focus',
  'nightShift',
  'nightReassurance',
  'creating',
  'done',
];

export const INITIAL_ONBOARDING_FLOW: OnboardingFlowState = { step: 'beat' };

/**
 * Pure, total step transition. Unknown transitions for the current step return
 * the same state object (a genuine no-op), so a stray dispatch can never strand
 * the flow in an impossible step.
 */
export function onboardingFlowReducer(
  state: OnboardingFlowState,
  action: OnboardingFlowAction,
): OnboardingFlowState {
  switch (action.type) {
    case 'reset':
      return state.step === 'beat' ? state : INITIAL_ONBOARDING_FLOW;
    case 'begin':
      return state.step === 'beat' ? { step: 'baby' } : state;
    case 'submit':
      if (state.step === 'baby') return { step: 'focus' };
      if (state.step === 'focus') return { step: 'nightShift' };
      if (state.step === 'nightShift') return { step: 'nightReassurance' };
      if (state.step === 'nightReassurance') return { step: 'creating' };
      return state;
    case 'skip':
      if (state.step === 'nightShift') return { step: 'nightReassurance' };
      // Early skips create a minimal baby; the reassurance step itself has no skip CTA.
      return state.step === 'beat' || state.step === 'baby' || state.step === 'focus'
        ? { step: 'creating' }
        : state;
    case 'created':
      return state.step === 'creating' ? { step: 'done' } : state;
    case 'back':
      if (state.step === 'nightReassurance') return { step: 'nightShift' };
      if (state.step === 'nightShift') return { step: 'focus' };
      if (state.step === 'focus') return { step: 'baby' };
      if (state.step === 'baby') return { step: 'beat' };
      return state;
    default:
      return state;
  }
}

/** Zero-based index of a step in the canonical order (for calm forward motion). */
export function onboardingStepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEP_ORDER.indexOf(step);
}

/** The flow is finished once the real baby exists and Tonight can take over. */
export function isOnboardingComplete(state: OnboardingFlowState): boolean {
  return state.step === 'done';
}
