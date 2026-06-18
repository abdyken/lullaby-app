import { Pressable, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme';

type Props = {
  label: string;
  accentColor: string;
  onPress?: () => void;
};

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
          alignItems: 'center',
          justifyContent: 'center',
          // Solid, stateful fill — painted reliably by Android on a plain View.
          backgroundColor: accentColor,
          borderRadius: radii.pill,
          paddingHorizontal: 28,
          paddingVertical: 13,
          // Opaque white frame so the pill separates from every hero sky even
          // when shadows do nothing on Android — critical for the blue pill on
          // the navy night sky ("Wake baby"), where fill and sky share a hue.
          borderWidth: 2,
          borderColor: colors.white,
          // Warm shadow for web/iOS depth; elevation is a bonus on Android, the
          // visible surface no longer depends on it.
          shadowColor: 'rgb(60,40,30)',
          shadowOpacity: 0.28,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }}>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 14,
            letterSpacing: 0.2,
            color: colors.white,
          }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default PrimaryActionButton;
