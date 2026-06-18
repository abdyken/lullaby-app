import { Animated, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  color: string;
  progress: Animated.Value;
  opacity: Animated.Value;
};

export function ThemeRevealOverlay({ visible, color, progress, opacity }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const originX = width - 41;
  const originY = insets.top + 35;
  const diameter = Math.ceil(Math.sqrt(width * width + height * height) * 2.2);
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.01, 1],
  });

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 50,
        overflow: 'hidden',
      }}>
      <Animated.View
        style={{
          opacity,
          position: 'absolute',
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: color,
          left: originX - diameter / 2,
          top: originY - diameter / 2,
          transform: [{ scale }],
        }}
      />
    </View>
  );
}

export default ThemeRevealOverlay;
