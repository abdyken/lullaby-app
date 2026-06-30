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

/** One compact value chip — a soft lavender tint with a short label. */
function ValueChip({ label }: { label: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.sleepTint,
        borderRadius: radii.pill,
        paddingHorizontal: 13,
        paddingVertical: 7,
      }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.sleep }}>{label}</Text>
    </View>
  );
}

/** A single calm row of value chips — replaces a heavy paragraph + bullet list. */
function ValueChips() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <ValueChip label="Backup" />
      <ValueChip label="Sync" />
      <ValueChip label="Caregiver sharing" />
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
      title="Save your night log"
      subtitle="Create an account to back up your baby's care history and pick up on another device."
      footer={
        configured ? (
          <AuthLink label="Already have an account? Sign in" onPress={() => openAuth('signIn')} />
        ) : undefined
      }>
      <ValueChips />

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
