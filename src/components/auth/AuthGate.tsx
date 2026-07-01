/**
 * AuthGate — decides what the app shows based on the auth/provisioning status.
 *
 * THE HARD RULE: the onboarding intro is a PRE-ACCOUNT surface. It runs ONLY in
 * the no-session flows (signed-out / local-only). Once a Supabase session exists —
 * or while one is being established (authenticating / postAuthSync) — the app must
 * NEVER route back into OnboardingGate/OnboardingScreen. A signed-in user has
 * finished onboarding by definition; replaying the intro after Google sign-in was
 * the "returns to onboarding again" loop, so authenticated states are structurally
 * kept out of OnboardingGate here.
 *
 *   loading         → branded transition (status not yet known)
 *   authenticating  → branded transition (OAuth round-trip in flight)
 *   postAuthSync    → branded transition (session landed, provisioning loading)
 *   signed-out      → onboarding intro, then the account-entry surface
 *                     (Continue locally / Create account / Sign in — never a wall)
 *   local-only      → onboarding intro (creates the local baby), then the app
 *   needs-setup     → AUTHENTICATED, no baby → the short account-finalize step
 *                     (BabySetupScreen, prefilled from the onboarding draft).
 *                     NEVER the onboarding intro.
 *   ready           → AUTHENTICATED + linked baby → the app. NEVER the intro.
 *
 * The dev/QA override EXPO_PUBLIC_FORCE_ONBOARDING is honored INSIDE OnboardingGate
 * (via `resolveOnboardingGateState`), so it can only ever replay the intro in the
 * no-session flows above — BEFORE sign-in. It is deliberately NOT consulted here
 * for any authenticated state (authenticating / postAuthSync / needs-setup /
 * ready), so it can never replay onboarding after a session exists. AuthGate
 * performs no storage writes, never signs out, and never clears baby/log data.
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
import { AuthTransition } from './AuthTransition';
import { BabySetupScreen } from './BabySetupScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  switch (status) {
    // No session yet: the onboarding intro runs first. OnboardingGate honors the
    // dev force flag internally, so a QA replay is possible here — but ONLY before
    // sign-in, never once a session exists.
    case 'local-only':
      return <OnboardingGate>{children}</OnboardingGate>;
    case 'signed-out':
      return (
        <OnboardingGate>
          <AccountEntryScreen />
        </OnboardingGate>
      );
    // Authenticated, no linked baby yet → go straight to the short account-finalize
    // step (BabySetupScreen, prefilled from the onboarding draft). NEVER the intro,
    // and never gated on the force flag — a signed-in user must not replay onboarding.
    case 'needs-setup':
      return <BabySetupScreen />;
    // Authenticated + linked baby → the app directly. NEVER the onboarding intro.
    case 'ready':
      return <>{children}</>;
    // Auth round-trip in flight, or a session just landed and provisioning is
    // loading: always the branded transition — never onboarding, the account
    // surface, or a stale signed-out screen while the status is still unknown.
    case 'authenticating':
    case 'postAuthSync':
      return <AuthTransition message="Preparing your account…" />;
    case 'loading':
    default:
      return <AuthTransition />;
  }
}

export default AuthGate;
