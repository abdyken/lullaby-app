/**
 * AuthGate — decides what the app shows based on the auth/provisioning status.
 *
 * The first-run onboarding INTRO gates only the NO-SESSION states — it is the
 * pre-account, learn-about-the-app + (local-first) baby-creation flow. Once a
 * caregiver is authenticated, the intro is behind them and must never replay:
 *
 *   loading      → calm spinner
 *   signed-out   → onboarding intro, then the account-entry surface
 *                  (Continue locally / Create account / Sign in — never a wall)
 *   local-only   → onboarding intro (creates the local baby), then the app
 *   needs-setup  → AUTHENTICATED, no baby yet → baby setup DIRECTLY (no intro)
 *   ready        → AUTHENTICATED + linked baby → the app DIRECTLY (no intro)
 *
 * Why authenticated states skip OnboardingGate: a successful Google/email sign-in
 * lands on 'needs-setup' (or 'ready'); wrapping those in OnboardingGate replayed
 * the whole intro for an authenticated user (and, with the dev force-onboarding
 * flag, every launch). Routing them straight to baby setup / the app is the fix.
 *
 * Crucially, the app's children (LocalEventProvider) only MOUNT in local-only or
 * ready — so in a configured build the night store + repository resolution don't
 * run until there's a real session + linked baby, and the local seed never
 * flashes behind the auth surface.
 */
import type { ReactNode } from 'react';

import { OnboardingGate } from '@/components/onboarding/OnboardingGate';
import { useAuth } from '@/state/AuthProvider';

import { AccountEntryScreen } from './AccountEntryScreen';
import { AuthLoading } from './AuthLoading';
import { BabySetupScreen } from './BabySetupScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  switch (status) {
    // No session yet: the onboarding intro runs first.
    case 'local-only':
      return <OnboardingGate>{children}</OnboardingGate>;
    case 'signed-out':
      return (
        <OnboardingGate>
          <AccountEntryScreen />
        </OnboardingGate>
      );
    // Authenticated: never replay the intro — go straight to the next real step.
    case 'needs-setup':
      return <BabySetupScreen />;
    case 'ready':
      return <>{children}</>;
    case 'loading':
    default:
      return <AuthLoading />;
  }
}

export default AuthGate;
