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

import { useAuth } from '@/state/AuthProvider';
import { colors, fonts, radii } from '@/theme';

import { AppleSignInButton } from './AppleSignInButton';
import { AuthScreen } from './AuthScreen';
import { AuthButton, AuthLink, AuthShell } from './AuthShell';

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

export function AccountEntryScreen() {
  const { continueLocally, busy, clearError } = useAuth();
  const [view, setView] = useState<'intro' | 'auth'>('intro');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signUp');

  // Entering email+password: reuse the existing AuthScreen, with a way back.
  if (view === 'auth') {
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
        <AuthLink label="Already have an account? Sign in" onPress={() => openAuth('signIn')} />
      }>
      <View style={{ gap: 12 }}>
        <Benefit text="Back up your night log, so a lost phone never loses it" />
        <Benefit text="Pick up on any of your devices" />
        <Benefit text="Share with caregivers — coming soon" />
      </View>

      <AuthButton label="Create account" onPress={() => openAuth('signUp')} disabled={busy} />
      {/* Native "Sign in with Apple" — renders on iOS only; null elsewhere, so the
          local-first "Continue locally" escape hatch always stays present. */}
      <AppleSignInButton />
      <SecondaryButton label="Continue locally" onPress={() => void continueLocally()} disabled={busy} />
    </AuthShell>
  );
}

export default AccountEntryScreen;
