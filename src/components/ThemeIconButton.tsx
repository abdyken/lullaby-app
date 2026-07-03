import { Animated, Dimensions, Easing, Pressable, View, type GestureResponderEvent } from 'react-native';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/state/ThemeProvider';
import { colors, shadows, type SurfaceMode } from '@/theme';

/** `pressInAt` (ms epoch) lets the provider measure real press→reveal latency in dev. */
export type ThemeToggleHandler = (
  pageX?: number,
  pageY?: number,
  pressInAt?: number,
) => void | Promise<void>;

type Props = {
  surfaceMode: SurfaceMode;
  /** Fired with the press point so the native reveal starts under the user's tap. */
  onPress: ThemeToggleHandler;
  disabled?: boolean;
};

/** Opacity while the finger is down — the one visible reaction on press-in. No
 * transform/scale/shadow/layout change, so the button's footprint never moves. */
const PRESSED_OPACITY = 0.6;

/** Icon swap timing. The real button updates under the native screenshot overlay,
 * then appears already settled as the circular reveal exposes it. */
const ICON_DURATION = 300;
const ICON_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);
/** 0 = day (moon shown, tap → night), 1 = night (sun shown, tap → day). */
const nightAmount = (mode: SurfaceMode) => (mode === 'night' ? 1 : 0);

/**
 * A stacked icon that fades/scales/rotates in or out. It fills the fixed icon
 * container and centres its glyph, and only ever uses transforms whose origin is
 * the centre (scale + rotate) — never translate/layout — so the icon's centre
 * point is identical before, during and after the swap (no upward drift).
 */
function AnimatedIcon({
  opacity,
  scale,
  rotate,
  children,
}: {
  opacity: Animated.AnimatedInterpolation<number>;
  scale: Animated.AnimatedInterpolation<number>;
  rotate: Animated.AnimatedInterpolation<string>;
  children: ReactNode;
}) {
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        transform: [{ scale }, { rotate }],
      }}>
      {children}
    </Animated.View>
  );
}

function MoonGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
        stroke={colors.sleep}
        strokeWidth={2.1}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SunGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4.2} stroke={colors.feed2} strokeWidth={2.1} />
      <Path
        d="M12 2.7v2M12 19.3v2M4.8 4.8l1.4 1.4M17.8 17.8l1.4 1.4M2.7 12h2M19.3 12h2M4.8 19.2l1.4-1.4M17.8 6.2l1.4-1.4"
        stroke={colors.feed2}
        strokeWidth={2.1}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ThemeIconButton({ surfaceMode, onPress, disabled = false }: Props) {
  const { mode: committedMode } = useTheme();
  const isNight = surfaceMode === 'night';
  const buttonRef = useRef<View>(null);
  // Cached window-space centre of the button, measured on layout so the reveal
  // origin is available synchronously on tap (no measurement in the tap path).
  const centerRef = useRef<{ x: number; y: number } | null>(null);
  // One reveal per gesture: press-in fires it; the trailing onPress (or a stray
  // second signal for the same touch) is consumed instead of toggling back.
  const gestureHandledRef = useRef(false);
  const [pressed, setPressed] = useState(false);
  // 0 = moon (day) … 1 = sun (night). Starts at the currently committed theme.
  const [icon] = useState(() => new Animated.Value(nightAmount(committedMode)));

  // Measure and cache the button centre ahead of the tap so we never pay a
  // measureInWindow round-trip on the critical path.
  const handleLayout = () => {
    const node = buttonRef.current;
    if (!node) return;
    node.measureInWindow((x, y, w, h) => {
      if (Number.isFinite(x) && Number.isFinite(y) && w > 0 && h > 0) {
        centerRef.current = { x: x + w / 2, y: y + h / 2 };
      }
    });
  };

  // The reveal origin, resolved synchronously: live press point → cached centre →
  // a safe top-right fallback near where the button lives in the header.
  const resolveOrigin = (event?: GestureResponderEvent): { x: number; y: number } => {
    const pageX = event?.nativeEvent.pageX;
    const pageY = event?.nativeEvent.pageY;
    if (typeof pageX === 'number' && typeof pageY === 'number' && Number.isFinite(pageX) && Number.isFinite(pageY)) {
      return { x: pageX, y: pageY };
    }
    if (centerRef.current) return centerRef.current;
    const { width } = Dimensions.get('window');
    return { x: width - 30, y: 64 };
  };

  const startReveal = (event: GestureResponderEvent, pressInAt: number) => {
    const origin = resolveOrigin(event);
    void onPress(origin.x, origin.y, pressInAt);
  };

  // Start the reveal on press-in (finger-down), not on release, so the screenshot
  // capture + theme commit run while the finger is still down. The trailing
  // onPress for the same touch is consumed by gestureHandledRef.
  const handlePressIn = (event: GestureResponderEvent) => {
    if (disabled) return;
    setPressed(true);
    gestureHandledRef.current = true;
    startReveal(event, Date.now());
  };

  const handlePressOut = () => {
    setPressed(false);
  };

  // Fires last for a touch (already handled by press-in → consume) and is the only
  // signal for an accessibility activation, which never sends press-in.
  const handlePress = (event: GestureResponderEvent) => {
    if (gestureHandledRef.current) {
      gestureHandledRef.current = false;
      return;
    }
    if (disabled) return;
    startReveal(event, Date.now());
  };

  // The icon follows the committed mode. During native reveal, the old UI is a
  // screenshot overlay, so this real button can settle underneath before it shows.
  useEffect(() => {
    Animated.timing(icon, {
      toValue: nightAmount(committedMode),
      duration: ICON_DURATION,
      easing: ICON_EASING,
      useNativeDriver: true,
    }).start();
  }, [committedMode, icon]);

  // Centre-anchored swap only: fade + scale + gentle rotation. No translate, so
  // the icon never drifts up/down — moon fades/scales out as sun fades/scales in.
  const moonOpacity = icon.interpolate({ inputRange: [0, 0.55], outputRange: [1, 0], extrapolate: 'clamp' });
  const moonScale = icon.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] });
  const moonRotate = icon.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-40deg'] });

  const sunOpacity = icon.interpolate({ inputRange: [0.45, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const sunScale = icon.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const sunRotate = icon.interpolate({ inputRange: [0, 1], outputRange: ['40deg', '0deg'] });

  return (
    <Pressable
      ref={buttonRef}
      accessibilityRole="button"
      accessibilityLabel={isNight ? 'Switch to day theme' : 'Switch to night theme'}
      onLayout={handleLayout}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      unstable_pressDelay={0}
      disabled={disabled}
      hitSlop={8}
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.74)',
        // borderWidth stays constant (no size change between modes); night uses a
        // transparent stroke so no ring/outline shows around the sun on the dark
        // surface. Day keeps the soft glass edge it blends into on the light header.
        borderWidth: 1,
        borderColor: isNight ? 'transparent' : 'rgba(255,255,255,0.88)',
        // Opacity-only press feedback (no transform/scale/shadow/layout), so the
        // button reacts within a frame while its footprint stays put.
        opacity: disabled ? 0.72 : pressed ? PRESSED_OPACITY : 1,
        ...shadows.card,
        shadowColor: isNight ? 'rgb(0,0,0)' : shadows.card.shadowColor,
      }}>
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <AnimatedIcon opacity={moonOpacity} scale={moonScale} rotate={moonRotate}>
          <MoonGlyph />
        </AnimatedIcon>
        <AnimatedIcon opacity={sunOpacity} scale={sunScale} rotate={sunRotate}>
          <SunGlyph />
        </AnimatedIcon>
      </View>
    </Pressable>
  );
}

export default ThemeIconButton;
