import { Animated, Easing, Pressable, View } from 'react-native';
import { useEffect, useState } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, shadows, surfaces, type SurfaceMode } from '@/theme';

type Props = {
  surfaceMode: SurfaceMode;
  onPress: () => void;
  disabled?: boolean;
};

function MoonIcon({ opacity }: { opacity: Animated.AnimatedInterpolation<number> }) {
  return (
    <Animated.View style={{ position: 'absolute', opacity }}>
      <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
        <Path
          d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
          stroke={colors.sleep}
          strokeWidth={2.1}
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  );
}

function SunIcon({ opacity }: { opacity: Animated.AnimatedInterpolation<number> }) {
  return (
    <Animated.View style={{ position: 'absolute', opacity }}>
      <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={4.2} stroke={colors.feed2} strokeWidth={2.1} />
        <Path
          d="M12 2.7v2M12 19.3v2M4.8 4.8l1.4 1.4M17.8 17.8l1.4 1.4M2.7 12h2M19.3 12h2M4.8 19.2l1.4-1.4M17.8 6.2l1.4-1.4"
          stroke={colors.feed2}
          strokeWidth={2.1}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

export function ThemeIconButton({ surfaceMode, onPress, disabled = false }: Props) {
  const [progress] = useState(() => new Animated.Value(surfaceMode === 'night' ? 1 : 0));
  const isNight = surfaceMode === 'night';
  const palette = surfaces[surfaceMode];

  useEffect(() => {
    Animated.timing(progress, {
      toValue: isNight ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isNight, progress]);

  const moonOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const sunOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const iconScale = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.82, 1] });
  const iconRotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '120deg'] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isNight ? 'Switch to day theme' : 'Switch to night theme'}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.74)',
        borderWidth: 1,
        borderColor: isNight ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.88)',
        opacity: disabled ? 0.72 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
        ...shadows.card,
        shadowColor: isNight ? 'rgb(0,0,0)' : shadows.card.shadowColor,
      })}>
      <Animated.View
        style={{
          width: 24,
          height: 24,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: iconScale }, { rotate: iconRotate }],
        }}>
        <MoonIcon opacity={moonOpacity} />
        <SunIcon opacity={sunOpacity} />
      </Animated.View>
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          borderRadius: 21,
          borderWidth: 1,
          borderColor: palette.border,
        }}
      />
    </Pressable>
  );
}

export default ThemeIconButton;
