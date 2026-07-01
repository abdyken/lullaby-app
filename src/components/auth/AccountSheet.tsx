/**
 * AccountSheet — a minimal account surface, reached by tapping the baby header
 * (the blueprint's stated home for settings). It exists mainly so a configured
 * build is testable: see your auth state, then either sign out (signed in) or set
 * up an account (a "continue locally" guest). Deliberately tiny — not a settings
 * dashboard.
 *
 * Reachable in any *configured* build (Tonight passes the header onPress whenever
 * Supabase is configured), for both a signed-in caregiver and a "continue
 * locally" guest, so the surface can show auth state (signed in vs guest). In the
 * unconfigured local demo the header stays inert, so demo behavior is unchanged.
 */
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UpgradeCard } from '@/components/UpgradeCard';
import { getProMode } from '@/lib/proConfig';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/state/AuthProvider';
import { colors, fonts, radii, shadows } from '@/theme';

import { InviteCaregiverSheet } from './InviteCaregiverSheet';

export function AccountSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { session, caregiver, signOut, goToAccountEntry, busy } = useAuth();
  const email = session?.user.email ?? null;
  const signedIn = session != null;
  // Whether this build can actually reach the auth backend. A guest in a
  // configured build gets the upgrade affordance; an unconfigured local build
  // gets a calm setup-required note instead of a button that goes nowhere.
  const configured = isSupabaseConfigured;
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(46,42,64,0.35)',
          }}
        />

        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radii.large,
            borderTopRightRadius: radii.large,
            paddingTop: 10,
            paddingHorizontal: 18,
            paddingBottom: insets.bottom + 18,
            ...shadows.soft,
          }}>
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.line,
              marginBottom: 14,
            }}
          />

          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink }}>Account</Text>

          {signedIn ? (
            <>
              <Text
                style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 4 }}>
                {caregiver?.displayName
                  ? `Signed in as ${caregiver.displayName}${email ? ` · ${email}` : ''}`
                  : email
                    ? `Signed in as ${email}`
                    : 'Signed in'}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.body,
                  fontSize: 12,
                  lineHeight: 18,
                  color: colors.inkFaint,
                  marginTop: 8,
                }}>
                Your night log is shared with your caregivers on this baby.
              </Text>

              {/* Low-emphasis invite entry point (Supabase ready mode only). */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Invite caregiver"
                onPress={() => setInviteOpen(true)}
                style={({ pressed }) => ({
                  marginTop: 18,
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radii.medium,
                  backgroundColor: colors.sleepTint,
                  opacity: pressed ? 0.7 : 1,
                })}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.sleep }}>
                  Invite caregiver
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                accessibilityState={{ busy }}
                onPress={() => void signOut()}
                disabled={busy}
                style={({ pressed }) => ({
                  marginTop: 10,
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radii.medium,
                  backgroundColor: colors.surfaceSoft,
                  borderWidth: 1,
                  borderColor: colors.line,
                  opacity: pressed || busy ? 0.6 : 1,
                })}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.feed }}>
                  Sign out
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text
                style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 4 }}>
                Back up and sync your logs.
              </Text>
              <Text
                style={{
                  fontFamily: fonts.body,
                  fontSize: 12,
                  lineHeight: 18,
                  color: colors.inkFaint,
                  marginTop: 6,
                }}>
                You{'’'}re local right now — your baby and logs stay safe on this phone.
              </Text>

              {configured ? (
                /* Quiet upgrade affordance — routes to the existing account-entry
                   surface (Create account / Continue locally / Sign in). Navigation
                   only; it migrates no local data and never forces an account. */
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create account or sign in"
                  onPress={() => {
                    onClose();
                    void goToAccountEntry();
                  }}
                  style={({ pressed }) => ({
                    marginTop: 18,
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radii.medium,
                    backgroundColor: colors.sleepTint,
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.sleep }}>
                    Create account or sign in
                  </Text>
                </Pressable>
              ) : (
                /* Unconfigured local build: no backend to reach, so show a calm
                   setup-required note instead of a dead button. (No apostrophes —
                   react/no-unescaped-entities.) */
                <Text
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 12,
                    lineHeight: 18,
                    color: colors.inkFaint,
                    marginTop: 16,
                  }}>
                  Account backup and sync turn on once this build is connected to its account
                  service.
                </Text>
              )}
            </>
          )}

          {/* Non-paid Lullaby Pro preview — only in fake-door "preview" mode
              (EXPO_PUBLIC_PRO_PREVIEW_ENABLED on, PRO_ENABLED off; off by default)
              AND only for a signed-in user (never guest/local). Real Pro supersedes
              it (§11). Records interest only; no payment, no navigation. */}
          {getProMode() === 'preview' && signedIn ? <UpgradeCard source="account_sheet" /> : null}
        </View>
      </View>

      {signedIn && inviteOpen && <InviteCaregiverSheet onClose={() => setInviteOpen(false)} />}
    </Modal>
  );
}

export default AccountSheet;
