/**
 * AccountEntryScreen — the calm account-entry surface shown after onboarding when
 * a configured build has no session (status 'signed-out'). It REPLACES the old
 * sign-in wall: local-first stays the default ("Continue locally"), and creating
 * an account / signing in are offered, not forced. This is the direct expression
 * of the auth guardrail: NEVER force account creation — "Continue locally" must
 * remain. The value copy explains what an account adds (backup, sync, sharing
 * later) without over-promising partner/realtime sync.
 *
 * Self-contained two-view surface so the gate stays a one-liner:
 *   intro → the value pitch + three choices (Create account / Continue locally / Sign in)
 *   auth  → the existing <AuthScreen> (email+password), with a back link to intro
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/state/AuthProvider';
import { colors, fonts, radii } from '@/theme';

import { AppleSignInButton } from './AppleSignInButton';
import { AuthScreen } from './AuthScreen';
import { AuthButton, AuthLink, AuthShell } from './AuthShell';
import { GoogleSignInButton } from './GoogleSignInButton';

/** A quiet value line: a soft accent dot + calm body copy. */
function Benefit({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View
        style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.sleep, marginTop: 6 }}
      />
      <Text
        style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>
        {text}
      </Text>
    </View>
  );
}

/** Secondary (outline) button — mirrors the AccountSheet's quiet action style. */
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
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radii.pill,
        backgroundColor: colors.surfaceSoft,
        borderWidth: 1,
        borderColor: colors.line,
        paddingHorizontal: 24,
        opacity: pressed || disabled ? 0.6 : 1,
      })}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }}>{label}</Text>
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
        Backup and sync turn on once Lullaby is connected to its account service. For now,
        everything stays safely on this phone.
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
      title="Keep your nights safe"
      subtitle="Lullaby works fully on this phone. Add an account when you want a backup and sync — there's no rush."
      footer={
        configured ? (
          <AuthLink label="Already have an account? Sign in" onPress={() => openAuth('signIn')} />
        ) : undefined
      }>
      <View style={{ gap: 12 }}>
        <Benefit text="Back up your night log, so a lost phone never loses it" />
        <Benefit text="Pick up on any of your devices" />
        <Benefit text="Share with caregivers — coming soon" />
      </View>

      {configured ? (
        <>
          <AuthButton label="Create account" onPress={() => openAuth('signUp')} disabled={busy} />
          {/* Native "Sign in with Apple" — renders on iOS only; null elsewhere, so the
              local-first "Continue locally" escape hatch always stays present. */}
          <AppleSignInButton />
          {/* "Continue with Google" — iOS + Android via the system browser; null when
              not configured (or on web), so the escape hatch below always stays. */}
          <GoogleSignInButton />
        </>
      ) : (
        <SetupRequiredNote />
      )}
      {/* Always present in both states — the "never force account creation" guardrail. */}
      <SecondaryButton label="Continue locally" onPress={() => void continueLocally()} disabled={busy} />
    </AuthShell>
  );
}

export default AccountEntryScreen;
