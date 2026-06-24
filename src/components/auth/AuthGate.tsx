/**
 * AuthGate — decides what the app shows based on the auth/provisioning status.
 *
 *   local-only         → first-run onboarding, then render the app
 *   ready              → render the app (its children: provider + tabs)
 *   loading            → calm spinner
 *   signed-out         → first-run onboarding, then sign-in / sign-up
 *   needs-setup        → first-run onboarding, then baby setup
 *
 * Crucially, the app's children (LocalEventProvider) only MOUNT in local-only or
 * ready — so in a configured build the night store + repository resolution don't
 * run until there's a real session + linked baby, and the local seed never
 * flashes behind the auth surface.
 */
import type { ReactNode } from 'react';

import { OnboardingGate } from '@/components/onboarding/OnboardingGate';
import { useAuth } from '@/state/AuthProvider';

import { AuthLoading } from './AuthLoading';
import { AuthScreen } from './AuthScreen';
import { BabySetupScreen } from './BabySetupScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  switch (status) {
    case 'local-only':
      return <OnboardingGate>{children}</OnboardingGate>;
    case 'ready':
      return <>{children}</>;
    case 'needs-setup':
      return (
        <OnboardingGate>
          <BabySetupScreen />
        </OnboardingGate>
      );
    case 'signed-out':
      return (
        <OnboardingGate>
          <AuthScreen />
        </OnboardingGate>
      );
    case 'loading':
    default:
      return <AuthLoading />;
  }
}

export default AuthGate;
