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
 * Steps: `beat` (emotional landing) → `baby` (age + optional name) → `creating`
 * (writing the real local baby) → `done` (reveal Tonight). "Set up later" / "Skip
 * for now" jump straight to `creating` (a minimal valid baby is still created).
 */
export type OnboardingStep = 'beat' | 'baby' | 'creating' | 'done';

export type OnboardingFlowState = {
  step: OnboardingStep;
};

export type OnboardingFlowAction =
  /** Beat "Begin" → ask about the baby. */
  | { type: 'begin' }
  /** Baby step "Continue" → start writing the real local baby. */
  | { type: 'submit' }
  /** "Set up later" / "Skip for now" → minimal baby, straight to creation. */
  | { type: 'skip' }
  /** Local baby written + seed cleared → reveal Tonight. */
  | { type: 'created' }
  /** Back out of the baby step to the beat (no data collected yet). */
  | { type: 'back' }
  /** Return to the first step (e.g. a dev reset / re-run). */
  | { type: 'reset' };

export const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] = ['beat', 'baby', 'creating', 'done'];

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
      return state.step === 'baby' ? { step: 'creating' } : state;
    case 'skip':
      // Reachable from the landing beat or the baby step; both create a minimal baby.
      return state.step === 'beat' || state.step === 'baby' ? { step: 'creating' } : state;
    case 'created':
      return state.step === 'creating' ? { step: 'done' } : state;
    case 'back':
      return state.step === 'baby' ? { step: 'beat' } : state;
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
