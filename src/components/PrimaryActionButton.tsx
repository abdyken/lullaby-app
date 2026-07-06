import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { PRESS_SPRING } from '@/lib/usePressScale';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radii } from '@/theme';

type Props = {
  label: string;
  accentColor: string;
  onPress?: () => void;
  animateColor?: boolean;
  pressOpacity?: number;
  pressScale?: number;
};

const BUTTON_MIN_WIDTH = 190;
const BUTTON_HEIGHT = 50;
const ICON_SLOT_SIZE = 18;

function hasActionIcon(label: string): boolean {
  return label === 'Start sleep' || label === 'Wake baby' || label === 'Baby woke up';
}

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

  if (label === 'Wake baby' || label === 'Baby woke up') {
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
 * pure touch + opacity wrapper and the View is the actual pill.
 */
export function PrimaryActionButton({
  label,
  accentColor,
  onPress,
  animateColor = true,
  pressOpacity = 0.95,
  pressScale = 0.96,
}: Props) {
  const reduceMotion = useReduceMotion();
  const [colorProgress] = useState(() => new Animated.Value(1));
  const [pressProgress] = useState(() => new Animated.Value(0));
  const previousAccent = useRef(accentColor);
  const [colorPair, setColorPair] = useState({ from: accentColor, to: accentColor });
  // Scale-on-press is the default for these primary actions; Reduce Motion ON
  // disables the animation and falls back to an opacity 0.86 press below.
  const usesAnimatedPress = reduceMotion !== true;
  const tactilePressScale = pressScale;
  const showIcon = hasActionIcon(label);

  useEffect(() => {
    if (!animateColor) {
      previousAccent.current = accentColor;
      colorProgress.setValue(1);
      return;
    }
    if (previousAccent.current === accentColor) return;
    const from = previousAccent.current;
    previousAccent.current = accentColor;
    setColorPair({ from, to: accentColor });
    colorProgress.setValue(0);
    const animation = Animated.timing(colorProgress, {
      toValue: 1,
      duration: 320,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [accentColor, animateColor, colorProgress]);

  const backgroundColor = animateColor
    ? colorProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [colorPair.from, colorPair.to],
      })
    : accentColor;
  const animatedPressScale = pressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, tactilePressScale],
  });
  const animatedPressOpacity = pressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, pressOpacity],
  });

  // Gentle, settled press spring (no overshoot — see PRESS_SPRING).
  const animatePress = (toValue: number) => {
    Animated.spring(pressProgress, { toValue, ...PRESS_SPRING }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={usesAnimatedPress ? () => animatePress(1) : undefined}
      onPressOut={usesAnimatedPress ? () => animatePress(0) : undefined}
      hitSlop={8}
      style={({ pressed }) => ({
        alignSelf: 'center',
        borderRadius: radii.pill,
        // Reduce Motion fallback: opacity 0.86 press (no scale animation).
        opacity: !usesAnimatedPress && pressed ? 0.86 : 1,
      })}>
      <Animated.View
        style={[
          {
            minWidth: BUTTON_MIN_WIDTH,
            height: BUTTON_HEIGHT,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor,
            borderRadius: radii.pill,
            paddingHorizontal: 24,
            borderWidth: 0,
            shadowColor: accentColor,
            shadowOpacity: 0.42,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          },
          usesAnimatedPress ? { opacity: animatedPressOpacity, transform: [{ scale: animatedPressScale }] } : null,
        ]}>
        <View
          pointerEvents="none"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
          {showIcon ? (
            <View
              style={{
                width: ICON_SLOT_SIZE,
                height: ICON_SLOT_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <ActionIcon label={label} />
            </View>
          ) : null}
          <Text
            numberOfLines={1}
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 15,
              lineHeight: 20,
              includeFontPadding: false,
              letterSpacing: 0,
              color: colors.white,
              textAlign: 'center',
              textAlignVertical: 'center',
            }}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default PrimaryActionButton;
