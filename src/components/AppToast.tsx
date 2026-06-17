/**
 * AppToast — the small "saved · Undo" confirmation that floats just above the
 * tab bar after a log. Calm by design: white surface, soft warm shadow, rounded
 * pill, small text — the same language as the rest of the app. No harsh colors.
 *
 * State lives in LocalEventProvider; this is purely presentational. It floats
 * clear of the floating tab bar (mirrors the bar's footprint math) so it never
 * covers the bar or the content below.
 */
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocalEvents } from '@/state/LocalEventProvider';
import { colors, fonts, radii, shadows, tabbar } from '@/theme';

/** Toast copy is "<message> · Undo"; split the label off so Undo is its own tap target. */
function splitMessage(message: string): string {
  return message.replace(/\s*·\s*Undo\s*$/, '');
}

export function AppToast() {
  const insets = useSafeAreaInsets();
  const { toast, undoLastEvent } = useLocalEvents();

  if (!toast) return null;

  // Sit just above the floating tab bar (same footprint math as Screen).
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
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.ink }}>
          {splitMessage(toast.message)}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}> · </Text>
        <Pressable
          onPress={undoLastEvent}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Undo last entry">
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.sleep }}>Undo</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default AppToast;
