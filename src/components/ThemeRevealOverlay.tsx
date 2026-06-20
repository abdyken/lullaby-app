/**
 * Theme cross-fade — the incoming-theme layer fades in over the frozen
 * current-theme base, then the base commits beneath it (see ThemeProvider).
 *
 * WHY A CROSS-FADE (not the old circular reveal): the previous implementation
 * clipped the incoming theme to an expanding SVG circle via MaskedView. On real
 * Android (Expo Go) that circle was unreliable — its origin could land far from
 * the toggle (the reveal appeared to grow from the bottom) and, at full
 * progress, the corner farthest from the origin was left uncovered, stranding a
 * curved sliver of the OLD theme (most visibly the bottom corners + the
 * safe-area strip). It also let the bottom of the screen commit to the new theme
 * before the top, so the tab bar and screen looked out of sync mid-transition.
 *
 * A full-layer opacity cross-fade has none of those failure modes: there is no
 * origin, radius, corner, mask, or coordinate space to get wrong. The layer
 * covers exactly the pixels its children cover, fades uniformly, and is driven
 * by the ONE shared `revealProgress` that the screen content (this overlay) and
 * the tab bar (TabBarRevealOverlay) both read — so every pixel of the UI
 * transitions in perfect lockstep. Because the incoming copy is the SAME layout
 * as the base (same <Screen>, same frozen data), the fade reads as a smooth
 * recolour, never as ghosting of mismatched content.
 *
 * The commit choreography (commit the new mode under the fully-opaque layer,
 * tear the layer down a frame later) is unchanged and still lives in
 * ThemeProvider — at progress 1 this layer is fully opaque, so it covers the
 * base exactly like the fully-grown circle used to.
 */
import type { ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type LayerProps = {
  /** 0 → 1; drives the incoming layer's opacity */
  progress: Animated.Value;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  // Retained for call-site compatibility with the old circular reveal; the
  // cross-fade ignores all geometry. Kept optional so callers need no change.
  originX?: number;
  originY?: number;
  maxRadius?: number;
  width?: number;
  height?: number;
};

/**
 * Fades `children` (rendered in the incoming theme) from transparent to fully
 * opaque as `progress` goes 0 → 1. Name kept (`ThemeRevealMask`) so the tab-bar
 * reveal overlay's import is untouched.
 */
export function ThemeRevealMask({ progress, children, style }: LayerProps) {
  return (
    <Animated.View style={[style ?? StyleSheet.absoluteFill, { opacity: progress }]}>
      {children}
    </Animated.View>
  );
}

type OverlayProps = {
  visible: boolean;
  progress: Animated.Value;
  /** a full-screen copy of the screen content rendered in the incoming theme */
  children: ReactNode;
  // Ignored geometry, kept for call-site compatibility (see LayerProps).
  originX?: number;
  originY?: number;
  maxRadius?: number;
};

export function ThemeRevealOverlay({ visible, progress, children }: OverlayProps) {
  if (!visible) return null;

  return (
    // Default pointerEvents ('auto') so the base UI can't be touched mid-fade.
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
      <ThemeRevealMask progress={progress}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {children}
        </View>
      </ThemeRevealMask>
    </View>
  );
}

export default ThemeRevealOverlay;
