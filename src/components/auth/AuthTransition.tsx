/**
 * AuthTransition — the calm, branded interstitial shown whenever the app is
 * resolving auth or provisioning after sign-in. It is rendered for the
 * `loading` / `authenticating` / `postAuthSync` auth statuses (via AuthGate) and
 * while the `/auth-callback` deep link completes the session exchange.
 *
 * It replaces the bare cream spinner (AuthLoading now delegates here) so the
 * moment right after a Google account is picked reads as a smooth, on-brand
 * transition — the Lullaby logo mark, a quiet spinner, one calm line — instead of
 * a white/blank flash or a screen that visibly jumps between surfaces.
 *
 * Static theme tokens only (no ThemeProvider dependency) and no heavy deps, so it
 * is safe to render very early in the boot sequence and from the callback route.
 */
import { ActivityIndicator, Image, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

const logoSource = require('../../../assets/images/lullaby-logo-mark.png');

export function AuthTransition({ message = 'Just a moment…' }: { message?: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.cream,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 22,
      }}>
      <Image
        accessible
        accessibilityLabel="Lullaby"
        source={logoSource}
        resizeMode="contain"
        style={{ width: 88, height: 88 }}
      />
      <ActivityIndicator color={colors.sleep} />
      {message.length > 0 ? (
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 15,
            lineHeight: 21,
            color: colors.inkSoft,
            textAlign: 'center',
          }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export default AuthTransition;
