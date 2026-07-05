/**
 * GoogleSignInButton — the "Continue with Google" affordance, rendered only where
 * it can actually work.
 *
 * Unlike Apple sign-in (iOS-only, native sheet), Google here uses the system
 * browser OAuth flow, so it is offered on BOTH iOS and Android — but only when a
 * Supabase client AND a Google OAuth client ID are configured for the build
 * (`isGoogleSignInConfigured`). When either is absent, or on web (the native app
 * is the target; the browser-popup flow is untested here), this returns `null` —
 * never a dead/disabled button — so email + password and "Continue locally" always
 * remain present (the local-first guardrail).
 *
 * No native Google module is installed, so there is no official `GoogleSigninButton`
 * component; we render the app's calm pill in Google's neutral light style (white
 * surface, hairline border, dark label) to sit beside the black Apple button. The
 * official multicolor Google logo is a brand asset and is intentionally not
 * fabricated here — adding it is a production follow-up. The press delegates to
 * `signInWithGoogle()` in AuthProvider, which owns the browser round-trip, the
 * Supabase exchange, and all error/cancel copy.
 */
import { Platform, Pressable, Text, View } from 'react-native';

import { isGoogleSignInConfigured } from '@/lib/googleAuth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/state/AuthProvider';
import { colors, fonts, radii } from '@/theme';

export function GoogleSignInButton({
  variant = 'secondary',
}: {
  /**
   * Visual weight only — the handler/flow is identical. 'primary' paints the
   * filled indigo pill (the promoted account path); 'secondary' is the quiet
   * light-surface pill. Presentation-only: the account/OAuth logic never changes.
   */
  variant?: 'primary' | 'secondary';
} = {}) {
  const { signInWithGoogle, busy } = useAuth();
  const primary = variant === 'primary';

  // Hidden unless this build can actually complete a Google sign-in: a configured
  // Supabase client + a Google OAuth client ID, on a native platform. Absent →
  // null (not disabled), so the surface never shows a dead button and the
  // local-first escape hatch always stays present.
  if (Platform.OS === 'web' || !isSupabaseConfigured || !isGoogleSignInConfigured) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled: busy, busy }}
      onPress={() => {
        // Guard against a double-tap while a sign-in is already in flight.
        if (!busy) void signInWithGoogle();
      }}
      disabled={busy}
      style={({ pressed }) => ({
        borderRadius: radii.pill,
        transform: [{ scale: pressed && !busy ? 0.98 : 1 }],
      })}>
      {/* Fill on an inner View so it paints reliably on Android. Flat (no shadow).
          'primary' is the filled indigo pill (the promoted account path); the
          default 'secondary' is the quiet light-surface pill. */}
      <View
        style={{
          minHeight: primary ? 52 : 50,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? colors.sleep : colors.surface,
          borderRadius: radii.pill,
          borderWidth: primary ? 0 : 1,
          borderColor: colors.line,
          paddingHorizontal: 24,
          opacity: busy ? 0.55 : 1,
        }}>
        {/* While a sign-in is launching/completing, the label reads as progress so
            a repeated tap (already guarded above) is clearly unnecessary. */}
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 15,
            letterSpacing: primary ? 0.2 : 0,
            color: primary ? colors.white : colors.ink,
          }}>
          {busy ? 'Signing in…' : 'Continue with Google'}
        </Text>
      </View>
    </Pressable>
  );
}

export default GoogleSignInButton;
