/**
 * AppleSignInButton — the native "Sign in with Apple" affordance, rendered ONLY
 * where it is actually supported.
 *
 * Apple sign-in is iOS-only (`expo-apple-authentication` ships no Android/web
 * implementation) and needs a configured Supabase client to exchange the identity
 * token, so on Android, web, and in the local-only demo this returns `null` and
 * the surrounding surface simply omits it — never a dead or disabled button. The
 * import itself is safe everywhere (the module only throws when its native methods
 * are *called*, which can't happen off iOS because we return first).
 *
 * Apple's Human Interface Guidelines require the system button styling, so we use
 * the native `AppleAuthenticationButton` rather than the app's pill button; it is
 * sized (50pt tall, full width, pill corner) to sit calmly beside the surface's
 * other actions. The press delegates to `signInWithApple()` in AuthProvider, which
 * owns the credential → `signInWithIdToken` exchange and all error/cancel copy.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/state/AuthProvider';
import { radii } from '@/theme';

export function AppleSignInButton() {
  const { signInWithApple, busy } = useAuth();

  // Hard platform/runtime gates. iOS + a configured client are the only context
  // where this affordance can do anything; everywhere else it is absent, not
  // disabled (acceptance: present only where supported, gracefully hidden on
  // Android/web). `AppleAuthentication.isAvailableAsync()` is the finer iOS-version
  // gate, but iOS 13+ (our floor) always has it, so the static check is enough and
  // avoids an async first-render flash on the primary entry surface.
  if (Platform.OS !== 'ios' || !isSupabaseConfigured) return null;

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={radii.pill}
      style={{ width: '100%', height: 50, opacity: busy ? 0.55 : 1 }}
      onPress={() => {
        // Guard against a double-tap while an auth request is already in flight.
        if (!busy) void signInWithApple();
      }}
    />
  );
}

export default AppleSignInButton;
