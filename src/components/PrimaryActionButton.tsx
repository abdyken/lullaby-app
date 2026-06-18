import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, fonts, radii } from '@/theme';

type Props = {
  label: string;
  accentColor: string;
  onPress?: () => void;
};

function ActionIcon({ label }: { label: string }) {
  if (label === 'Start sleep') {
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={4.5} stroke={colors.white} strokeWidth={2.2} />
        <Path
          d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"
          stroke={colors.white}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (label === 'Wake baby') {
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Path
          d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
          stroke={colors.white}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return null;
}

/**
 * The orb's primary action ("Start sleep" / "Wake baby" / "End feed" / "Done").
 *
 * The visible pill lives on an inner `View`, NOT on the `Pressable`. On real
 * Android (Expo Go), a `Pressable` with a function style renders its `Text`
 * child but does not reliably paint its own `backgroundColor`/`borderRadius`
 * surface — which is why the pill was invisible on device while the label
 * showed. A child `View` paints its solid background reliably (the quick-log
 * tiles already prove this pattern works on Android), so the Pressable is now a
 * pure touch + press-scale wrapper and the View is the actual pill.
 */
export function PrimaryActionButton({ label, accentColor, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        alignSelf: 'center',
        borderRadius: radii.pill,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}>
      <View
        style={{
          minHeight: 48,
          minWidth: 150,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          // Hush-style filled pill: solid state color, no white frame, with a
          // soft color-matched shadow. Keep the existing dimensions intact.
          backgroundColor: accentColor,
          borderRadius: radii.pill,
          paddingHorizontal: 28,
          paddingVertical: 13,
          borderWidth: 0,
          shadowColor: accentColor,
          shadowOpacity: 0.42,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}>
        <ActionIcon label={label} />
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 14.5,
            letterSpacing: 0,
            color: colors.white,
          }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default PrimaryActionButton;
