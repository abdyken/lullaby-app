/**
 * AccountEntryScreen — the calm account-entry surface shown after onboarding when
 * a configured build has no session (status 'signed-out'). It REPLACES the old
 * sign-in wall: this is a privacy-first, local-only build, so "Continue locally"
 * is the promoted, primary path, and creating an account / signing in are offered
 * as quiet secondary options, never forced. This is the direct expression of the
 * auth guardrail: NEVER force account creation — "Continue locally" must remain.
 * The copy stays honest for Shape A: local-only v1 (no account, data on device).
 *
 * Self-contained two-view surface so the gate stays a one-liner:
 *   intro → the promise + the local-first primary, with account options below
 *   auth  → the existing <AuthScreen> (email+password), with a back link to intro
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/state/AuthProvider';
import { colors, fonts, radii } from '@/theme';

import { AppleSignInButton } from './AppleSignInButton';
import { AuthScreen } from './AuthScreen';
import { AuthLink, AuthShell } from './AuthShell';
import { GoogleSignInButton } from './GoogleSignInButton';

/**
 * Primary (filled indigo) action — the one loud, promoted CTA. Flat by design
 * (no shadow/elevation), matching the onboarding polish; a filled accent pill on
 * the cream surface carries the weight on its own. The fill lives on an inner View
 * so it paints reliably on Android (a Pressable background can drop out). A
 * disabled CTA reads as a calm, intentionally-quiet pill (soft lavender fill,
 * faint label) rather than a washed-out indigo.
 */
function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        borderRadius: radii.pill,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}>
      <View
        style={{
          minHeight: 52,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: disabled ? colors.sleepTint : colors.sleep,
          borderRadius: radii.pill,
          paddingHorizontal: 24,
        }}>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 15,
            letterSpacing: 0.2,
            color: disabled ? colors.inkFaint : colors.white,
          }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Secondary (outline) button — a quiet, flat alternative to the primary action,
 * matching the "Continue with Google" pill so the account options read as one
 * calm secondary set. Fill + hairline border live on an inner View so they paint
 * reliably on Android.
 */
function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        borderRadius: radii.pill,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}>
      <View
        style={{
          minHeight: 50,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderRadius: radii.pill,
          borderWidth: 1,
          borderColor: colors.line,
          paddingHorizontal: 24,
          opacity: disabled ? 0.6 : 1,
        }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }}>{label}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Calm "accounts aren't set up in this build" note. Shown instead of the
 * Create/Sign-in actions when Supabase isn't configured, so the entry is never
 * hidden silently — the parent still sees the surface and the local-first choice,
 * just without dead buttons that can't reach a backend. (No apostrophes in the
 * copy, to stay clear of react/no-unescaped-entities.)
 */
function SetupRequiredNote() {
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSoft,
        borderRadius: radii.medium,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 14,
        gap: 4,
      }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }}>
        Accounts are not set up in this build yet
      </Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.inkSoft }}>
        Sign-in and account backup are unavailable here. Everything you log stays safely on
        this phone.
      </Text>
    </View>
  );
}

export function AccountEntryScreen() {
  const { continueLocally, busy, clearError } = useAuth();
  const [view, setView] = useState<'intro' | 'auth'>('intro');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signUp');
  // Configured = this build can actually reach the auth backend. When it cannot,
  // we still SHOW the entry (never hide it silently) but offer only the local-first
  // path plus a calm setup-required note — no dead Create/Sign-in buttons.
  const configured = isSupabaseConfigured;

  // Entering email+password: reuse the existing AuthScreen, with a way back. Only
  // reachable in a configured build (the buttons that set this view are hidden
  // otherwise); guard anyway so an unconfigured build can never land on a
  // non-functional auth form.
  if (configured && view === 'auth') {
    return (
      <AuthScreen
        initialMode={mode}
        onBack={() => {
          clearError();
          setView('intro');
        }}
      />
    );
  }

  const openAuth = (next: 'signIn' | 'signUp') => {
    clearError();
    setMode(next);
    setView('auth');
  };

  return (
    <AuthShell
      eyebrow="Lullaby"
      title="Save your night log"
      subtitle="No account needed. Everything you log stays on this phone."
      footer={
        configured ? (
          <AuthLink label="Already have an account? Sign in" onPress={() => openAuth('signIn')} />
        ) : undefined
      }>
      {configured ? (
        <>
          {/* Product decision: the account path is now the promoted, primary action.
              "Continue with Google" is the one filled indigo pill, at the top;
              Create account / Apple / Continue locally follow as quiet secondary
              options. This changes VISUAL WEIGHT ONLY — every handler, the auth flow
              and the guest/local path are untouched. */}
          <GoogleSignInButton variant="primary" />
          {/* Native "Sign in with Apple" — renders on iOS only; null elsewhere. */}
          <AppleSignInButton />
          <SecondaryButton label="Create account" onPress={() => openAuth('signUp')} disabled={busy} />
          {/* Local-first stays present and reachable (the "never force account
              creation" guardrail), just demoted to a quiet secondary choice. */}
          <SecondaryButton label="Continue locally" onPress={() => void continueLocally()} disabled={busy} />
        </>
      ) : (
        <>
          {/* Unconfigured build: no account backend exists, so the local-first path
              stays the promoted primary action alongside a calm setup note. */}
          <PrimaryButton label="Continue locally" onPress={() => void continueLocally()} disabled={busy} />
          <SetupRequiredNote />
        </>
      )}
    </AuthShell>
  );
}

export default AccountEntryScreen;
