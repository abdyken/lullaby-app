import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { AuthLoading } from '@/components/auth/AuthLoading';

import { OnboardingScreen } from './OnboardingScreen';
import { loadOnboardingComplete, markOnboardingComplete } from './onboardingStorage';

type OnboardingGateState = 'loading' | 'needed' | 'complete';

type Props = {
  children: ReactNode;
};

export function OnboardingGate({ children }: Props) {
  const [state, setState] = useState<OnboardingGateState>('loading');

  useEffect(() => {
    let active = true;

    loadOnboardingComplete()
      .then((complete) => {
        if (active) setState(complete ? 'complete' : 'needed');
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
    setState('complete');
  }, []);

  if (state === 'complete') {
    return <>{children}</>;
  }

  if (state === 'loading') {
    return <AuthLoading />;
  }

  return <OnboardingScreen onComplete={completeOnboarding} />;
}

export default OnboardingGate;
