import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { AuthLoading } from '@/components/auth/AuthLoading';
import { useAnalytics } from '@/lib/analytics';

import { OnboardingScreen } from './OnboardingScreen';
import {
  loadOnboardingComplete,
  markOnboardingComplete,
  resolveOnboardingGateState,
  type ResolvedOnboardingGateState,
} from './onboardingStorage';

type OnboardingGateState = 'loading' | ResolvedOnboardingGateState;

type Props = {
  children: ReactNode;
};

export function OnboardingGate({ children }: Props) {
  const [state, setState] = useState<OnboardingGateState>('loading');
  const track = useAnalytics();

  useEffect(() => {
    let active = true;

    loadOnboardingComplete()
      .then((complete) => {
        if (active) setState(resolveOnboardingGateState(complete));
      })
      .catch(() => {
        if (active) setState('needed');
      });

    return () => {
      active = false;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    await markOnboardingComplete();
    track('onboarding_completed');
    setState('complete');
  }, [track]);

  if (state === 'complete') {
    return <>{children}</>;
  }

  if (state === 'loading') {
    return <AuthLoading />;
  }

  return <OnboardingScreen onComplete={completeOnboarding} />;
}

export default OnboardingGate;
