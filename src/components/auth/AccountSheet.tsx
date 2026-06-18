/**
 * AccountSheet — a minimal account surface, reached by tapping the baby header
 * (the blueprint's stated home for settings). It exists mainly so a configured
 * build is testable: see who's signed in, and sign out to re-enter the flow or
 * switch accounts. Deliberately tiny — not a settings dashboard.
 *
 * Only mounted in Supabase mode (Tonight passes the header onPress only then),
 * so local-demo behavior is unchanged.
 */
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/state/AuthProvider';
import { colors, fonts, radii, shadows } from '@/theme';

export function AccountSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { session, caregiver, signOut, busy } = useAuth();
  const email = session?.user.email ?? null;

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
        </View>
      </View>
    </Modal>
  );
}

export default AccountSheet;
