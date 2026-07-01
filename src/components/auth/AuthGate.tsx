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
 * Why authenticated states normally skip OnboardingGate: a successful Google/email
 * sign-in lands on 'needs-setup' (or 'ready'); wrapping those in OnboardingGate
 * replayed the whole intro for an authenticated user. Routing them straight to
 * baby setup / the app is the fix — the DEFAULT, once-only behavior.
 *
 * The ONE exception is the dev/QA override EXPO_PUBLIC_FORCE_ONBOARDING=true
 * (`isForceOnboardingEnabled`, dev builds only): it intentionally replays the
 * onboarding intro on every launch for EVERY status, including an authenticated
 * user who already has a baby — so QA can always reach the flow. It is purely a
 * re-render of the intro on top of the existing state: AuthGate performs no
 * storage writes, never signs out, and never clears baby/log data. With the flag
 * off or unset the routing below is byte-for-byte the prior behavior.
 *
 * Crucially, the app's children (LocalEventProvider) only MOUNT in local-only or
 * ready — so in a configured build the night store + repository resolution don't
 * run until there's a real session + linked baby, and the local seed never
 * flashes behind the auth surface.
 */
import type { ReactNode } from 'react';

import { OnboardingGate } from '@/components/onboarding/OnboardingGate';
import { isForceOnboardingEnabled } from '@/components/onboarding/onboardingStorage';
import { useAuth } from '@/state/AuthProvider';

import { AccountEntryScreen } from './AccountEntryScreen';
import { AuthLoading } from './AuthLoading';
import { BabySetupScreen } from './BabySetupScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  // Dev/QA absolute override: replay the onboarding intro even for authenticated
  // users with a baby. Non-destructive — see the module comment. Off/unset in
  // production, where the once-only completion state below is always honored.
  const forceOnboarding = isForceOnboardingEnabled();

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
    // Authenticated: go straight to the next real step — UNLESS the dev force
    // override is on, which wraps the same surface in OnboardingGate so the QA
    // intro shows first without touching any account, baby, or log data.
    case 'needs-setup':
      return forceOnboarding ? (
        <OnboardingGate>
          <BabySetupScreen />
        </OnboardingGate>
      ) : (
        <BabySetupScreen />
      );
    case 'ready':
      return forceOnboarding ? <OnboardingGate>{children}</OnboardingGate> : <>{children}</>;
    case 'loading':
    default:
      return <AuthLoading />;
  }
}

export default AuthGate;
