/**
 * Logging v2 — a selectable pill for the Feed flow (side / preset / milk type).
 *
 * Matches the existing LogSheet option pills visually, but paints its surface on
 * an INNER View rather than on the Pressable itself: on real Android (Expo Go) a
 * Pressable with a function style does not reliably paint its own background, so
 * the quick-log tiles + PrimaryActionButton already use this inner-View pattern.
 * The Pressable stays a pure touch + press-scale wrapper. A 2px ring is always
 * present (transparent when inactive) so selection never shifts the pill's size.
 */
import { Pressable, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme';

type Props = {
  label: string;
  active: boolean;
  accentColor: string;
  accentTint: string;
  onPress: () => void;
  /** Grow to fill a flex row (default true). Set false for a content-width pill. */
  flex?: boolean;
  /** Defaults to `label`; override for a fuller screen-reader description. */
  accessibilityLabel?: string;
  disabled?: boolean;
};

export function ChoicePill({
  label,
  active,
  accentColor,
  accentTint,
  onPress,
  flex = true,
  accessibilityLabel,
  disabled = false,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: flex ? 1 : undefined,
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}>
      <View
        style={{
          minHeight: 52,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 14,
          borderRadius: radii.medium,
          backgroundColor: active ? accentTint : colors.surfaceSoft,
          borderWidth: 2,
          borderColor: active ? accentColor : 'transparent',
        }}>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 14,
            color: active ? accentColor : colors.inkSoft,
          }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default ChoicePill;
