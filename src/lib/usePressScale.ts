/**
 * usePressScale — a gentle, SETTLED "press-down" for the app's primary ACTION
 * buttons (Begin / Continue / Save / Finish / Start / Send / "I'm ready").
 *
 * The button scales to 0.96 on press-in and springs back to rest on release. The
 * spring is critically-damped with `overshootClamping` so it never bounces or
 * wobbles past rest — a calm night app must not feel springy/toy-like.
 *
 * The scale is a `transform` only, applied to the button's OWN inner view, so it
 * shrinks within its own bounds and never reflows/shifts neighbouring siblings
 * (transforms are resolved after layout). That sibling-shift was the reason scale
 * was removed before; keeping it a pure transform is what makes it safe.
 *
 * Reduce Motion: scale is motion, so it is gated on the OS setting. When Reduce
 * Motion is ON, no scale animation runs and callers fall back to an opacity 0.86
 * press (see `animate`) — feedback without movement, so a11y never regresses.
 *
 * Spring config lives here (exported) so every primary action shares one feel.
 */
import { useState } from 'react';
import { Animated } from 'react-native';

import { useReduceMotion } from '@/lib/useReduceMotion';

/** Critically-damped, no-overshoot press spring — the one source of "feel". */
export const PRESS_SPRING = {
  useNativeDriver: true,
  stiffness: 300,
  damping: 30,
  mass: 1,
  overshootClamping: true,
} as const;

export function usePressScale(scaleTo = 0.96) {
  const reduceMotion = useReduceMotion();
  // Animate unless Reduce Motion is confirmed ON (null = not resolved yet → animate).
  const animate = reduceMotion !== true;
  const [progress] = useState(() => new Animated.Value(0));

  const spring = (toValue: number) => {
    Animated.spring(progress, { toValue, ...PRESS_SPRING }).start();
  };

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, scaleTo] });

  return {
    /** false when Reduce Motion is ON — callers use opacity 0.86 as the fallback. */
    animate,
    onPressIn: animate ? () => spring(1) : undefined,
    onPressOut: animate ? () => spring(0) : undefined,
    /** Spread onto the button's inner Animated.View; null under Reduce Motion. */
    transformStyle: animate ? { transform: [{ scale }] } : null,
  };
}
