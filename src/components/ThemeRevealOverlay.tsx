/**
 * Telegram-style circular reveal — the real mask primitive + the screen host.
 *
 * `ThemeRevealMask` clips its children to a true vector circle: a MaskedView
 * whose mask is an SVG `<Circle>` with an animated **radius**. Inside the circle
 * the incoming theme shows; outside, the mask is transparent so the untouched
 * old theme underneath shows through. No rectangular wipe, opacity, scale, or
 * width/height/borderRadius trickery.
 *
 * IMPORTANT: the mask `<Svg>` MUST be given concrete pixel `width`/`height`.
 * With percentage sizes (`"100%"`) Android's MaskedView does not re-composite
 * when only the circle's native `r` prop animates — the radius changes but the
 * mask never redraws, so the reveal looks like an instant theme switch. Concrete
 * pixel dimensions make the mask redraw every frame, so the circle visibly grows.
 * We measure the layer (onLayout) for exact coverage and fall back to the passed
 * window-size dimensions for the very first frame (where the radius is ~0 anyway).
 *
 * `ThemeRevealOverlay` is the screen-content host: a full-screen layer (above
 * the screen, below the floating tab bar, which reveals itself in sync). It
 * captures touches for the duration so nothing underneath reacts mid-reveal.
 */
import { useState, type ReactNode } from 'react';
import {
  Animated,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type MaskProps = {
  /** circle centre in this mask's coordinate space (window coords for full-screen layers) */
  originX: number;
  originY: number;
  /** radius (px) at progress = 1 — sized to cover the farthest corner + a small margin */
  maxRadius: number;
  /** 0 → 1, mapped to the circle radius */
  progress: Animated.Value;
  /** fallback pixel size until the layer measures itself (keeps the mask concrete, never "100%") */
  width: number;
  height: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Clips `children` to a circle of animated radius centred at (originX, originY). */
export function ThemeRevealMask({
  originX,
  originY,
  maxRadius,
  progress,
  width,
  height,
  children,
  style,
}: MaskProps) {
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const w = measured?.w ?? width;
  const h = measured?.h ?? height;
  const radius = progress.interpolate({ inputRange: [0, 1], outputRange: [0, maxRadius] });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width: lw, height: lh } = event.nativeEvent.layout;
    if (lw > 0 && lh > 0) {
      setMeasured((prev) => (prev && prev.w === lw && prev.h === lh ? prev : { w: lw, h: lh }));
    }
  };

  return (
    <MaskedView
      style={style ?? StyleSheet.absoluteFill}
      onLayout={onLayout}
      maskElement={
        // Concrete pixel size — NOT "100%" — so Android redraws the mask each frame.
        <Svg width={w} height={h}>
          <AnimatedCircle cx={originX} cy={originY} r={radius} fill="#000" />
        </Svg>
      }>
      {children}
    </MaskedView>
  );
}

type OverlayProps = {
  visible: boolean;
  originX: number;
  originY: number;
  maxRadius: number;
  progress: Animated.Value;
  /** a full-screen copy of the screen content rendered in the incoming theme */
  children: ReactNode;
};

export function ThemeRevealOverlay({ visible, originX, originY, maxRadius, progress, children }: OverlayProps) {
  const { width, height } = useWindowDimensions();

  if (!visible) return null;

  return (
    // Default pointerEvents ('auto') so the base UI can't be touched mid-reveal.
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
      <ThemeRevealMask
        originX={originX}
        originY={originY}
        maxRadius={maxRadius}
        progress={progress}
        width={width}
        height={height}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {children}
        </View>
      </ThemeRevealMask>
    </View>
  );
}

export default ThemeRevealOverlay;
