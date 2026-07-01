/**
 * A calm full-screen placeholder while auth/provisioning resolves. Delegates to
 * the shared branded AuthTransition so every "resolving" surface — this, AuthGate's
 * loading/authenticating/post-auth-sync states, and the /auth-callback interstitial
 * — looks identical (the Lullaby logo mark + a quiet spinner on cream) instead of a
 * bare spinner that reads as a blank flash. Kept as a named component so existing
 * call sites (e.g. OnboardingGate) are untouched.
 */
import { AuthTransition } from './AuthTransition';

export function AuthLoading() {
  return <AuthTransition />;
}

export default AuthLoading;
