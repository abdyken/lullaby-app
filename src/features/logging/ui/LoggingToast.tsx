/**
 * LoggingToast — the v2 "saved · Undo" confirmation (plan §8, Phase 2/3/5/6).
 *
 * The flag-on counterpart to AppToast: the same calm pill language (white surface,
 * soft warm shadow, rounded pill, small text, floating just above the tab bar),
 * but it reads the v2 logging store via `useLogging()` and its Undo runs the
 * shared single-Undo (soft-delete a created event / restore a finished session).
 *
 * It is inert unless the loggingV2 flag is on AND a mutation just landed, so it
 * never collides with the legacy AppToast (the flag-off path): with the flag off
 * the provider does no I/O and never sets a toast; with it on, the v2 flows are
 * the ones saving, so only this toast shows. Purely presentational — all state
 * (the toast + the Undo action) lives in LoggingProvider.
 */
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows, tabbar } from '@/theme';

import { useLogging } from '../state/LoggingProvider';

export function LoggingToast() {
  const insets = useSafeAreaInsets();
  const { enabled, toast, undo } = useLogging();

  if (!enabled || !toast) return null;

  // Sit just above the floating tab bar (same footprint math as Screen/AppToast).
  const barFootprint = tabbar.height + Math.max(insets.bottom + 8, tabbar.marginBottom);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: barFootprint + 12,
        alignItems: 'center',
        paddingHorizontal: 18,
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: radii.pill,
          paddingVertical: 11,
          paddingHorizontal: 18,
          maxWidth: 340,
          ...shadows.card,
        }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.ink }}>{toast.message}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}> · </Text>
        <Pressable
          onPress={() => {
            void undo();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Undo last entry">
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.sleep }}>Undo</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default LoggingToast;
