/**
 * A calm full-screen placeholder while auth/provisioning resolves. Cream
 * background (never white/dark), a quiet spinner — no spinner-of-doom copy.
 */
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/theme';

export function AuthLoading() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.cream,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ActivityIndicator color={colors.sleep} />
    </View>
  );
}

export default AuthLoading;
