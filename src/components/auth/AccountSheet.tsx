/**
 * AccountSheet — the thin GUEST account router, reached by a guest tapping the
 * baby header. The baby avatar is the single account entry, branched by auth in
 * Tonight: a signed-in tap opens the full /settings screen (account, Pro,
 * appearance, delete), while a guest tap opens this light sheet — a guest has no
 * settings dashboard to manage, just the "continue locally" state and a way to
 * create an account or sign in. Deliberately tiny.
 *
 * It still renders both auth branches (so it's safe if ever shown to a signed-in
 * user), but in the live flow it is the guest surface. In the unconfigured local
 * demo the guest branch shows a calm setup-required note instead of a dead button.
 */
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/state/AuthProvider';
import { colors, fonts, radii, shadows } from '@/theme';

export function AccountSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { session, caregiver, signOut, goToAccountEntry, busy } = useAuth();
  const email = session?.user.email ?? null;
  const signedIn = session != null;
  // Whether this build can actually reach the auth backend. A guest in a
  // configured build gets the upgrade affordance; an unconfigured local build
  // gets a calm setup-required note instead of a button that goes nowhere.
  const configured = isSupabaseConfigured;

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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                accessibilityState={{ busy }}
                onPress={() => void signOut()}
                disabled={busy}
                style={({ pressed }) => ({
                  marginTop: 18,
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
                You{'’'}re using Lullaby locally.
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
                  Accounts are not set up in this build yet. Your baby and logs stay on this
                  phone.
                </Text>
              )}
            </>
          )}

          {/* Lullaby Pro now lives on the dedicated /settings screen (the single
              account home a signed-in tap opens). This sheet is the thin GUEST
              router — a guest has no Pro to manage — so it carries no Pro card. */}
        </View>
      </View>

    </Modal>
  );
}

export default AccountSheet;
