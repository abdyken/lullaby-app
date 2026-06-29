/**
 * useOnboardingFlow — the thin React binding over the pure `onboardingFlowReducer`
 * (onboarding Phase 1A foundation, roadmap §13). Keeping the transition logic in
 * `./onboardingFlow` (pure, smoke-tested) means this hook only owns the
 * `useReducer` wiring + stable dispatch callbacks the live screen will call.
 */
import { useCallback, useMemo, useReducer } from 'react';

import {
  INITIAL_ONBOARDING_FLOW,
  isOnboardingComplete,
  onboardingFlowReducer,
  onboardingStepIndex,
  type OnboardingStep,
} from './onboardingFlow';

export type OnboardingFlowController = {
  step: OnboardingStep;
  stepIndex: number;
  isComplete: boolean;
  /** Beat "Begin" → baby step. */
  begin: () => void;
  /** Decision-step "Continue" → baby to focus to nightShift to reassurance to creating. */
  submit: () => void;
  /** "Set up later" / "Skip for now"; night-shift skip still pauses on reassurance. */
  skip: () => void;
  /** Local baby written + seed cleared → reveal Tonight. */
  created: () => void;
  /** Back out of the current decision step. */
  back: () => void;
  /** Return to the first step. */
  reset: () => void;
};

export function useOnboardingFlow(): OnboardingFlowController {
  const [state, dispatch] = useReducer(onboardingFlowReducer, INITIAL_ONBOARDING_FLOW);

  const begin = useCallback(() => dispatch({ type: 'begin' }), []);
  const submit = useCallback(() => dispatch({ type: 'submit' }), []);
  const skip = useCallback(() => dispatch({ type: 'skip' }), []);
  const created = useCallback(() => dispatch({ type: 'created' }), []);
  const back = useCallback(() => dispatch({ type: 'back' }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  return useMemo(
    () => ({
      step: state.step,
      stepIndex: onboardingStepIndex(state.step),
      isComplete: isOnboardingComplete(state),
      begin,
      submit,
      skip,
      created,
      back,
      reset,
    }),
    [state, begin, submit, skip, created, back, reset],
  );
}

export default useOnboardingFlow;
