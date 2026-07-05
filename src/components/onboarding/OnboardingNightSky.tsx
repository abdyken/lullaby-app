/**
 * OnboardingNightSky — the calm dark backdrop for the onboarding closing beat
 * (night reassurance / handoff). Deep navy base (never pure #000), a crescent moon
 * with a slowly breathing halo, and a parallax starfield in three depth layers.
 *
 * All motion runs on Reanimated (UI-thread worklets, 60fps, identical on iOS +
 * Android): transform/opacity only, one shared clock per star layer (not one timer
 * per star), and glow (shadow/elevation) only on the few bright near-layer stars so
 * Android overdraw stays low. Under Reduce Motion every driver rests at 0 and the
 * scene renders a calm, phase-varied still — never a frozen mid-animation pose.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const FILL = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Rare streaking star — OFF by default. On a calm closing beat a shooting star can
 * read as a notification or a gimmick, so it ships off; flip to true to enable it
 * (it stays reduced-motion aware and only mounts when this is true).
 */
export const NIGHT_SKY_SHOOTING_STAR = false;

/**
 * Three parallax star layers. Depth comes from size plus how bright/fast each layer
 * twinkles: far = small, dim, slow; near = larger, brighter, a touch faster (and
 * the only layer that glows). Reads as depth rather than one flat uniform twinkle.
 */
type StarLayerName = 'far' | 'mid' | 'near';

type StarLayerSpec = {
  minOpacity: number;
  maxOpacity: number;
  /** One full twinkle cycle in ms — slower on the far layer. */
  periodMs: number;
  /** Peak-to-trough scale swing (kept tiny). */
  scaleAmp: number;
};

const STAR_LAYERS: Record<StarLayerName, StarLayerSpec> = {
  far: { minOpacity: 0.12, maxOpacity: 0.4, periodMs: 5200, scaleAmp: 0.06 },
  mid: { minOpacity: 0.28, maxOpacity: 0.66, periodMs: 4000, scaleAmp: 0.1 },
  near: { minOpacity: 0.48, maxOpacity: 0.92, periodMs: 3000, scaleAmp: 0.16 },
};

type Star = {
  top: number;
  left: number;
  size: number;
  /** Twinkle phase offset (0..1) so stars in a layer never pulse in lockstep. */
  phase: number;
  color: string;
  glow?: boolean;
};

/** Depth layer a star belongs to, by size (1 → far, 1.5 → mid, ≥2 → near). */
function layerForSize(size: number): StarLayerName {
  if (size <= 1) return 'far';
  if (size <= 1.5) return 'mid';
  return 'near';
}

// Hand-placed positions (kept from the original so the distribution never overlaps);
// size assigns the depth layer, and the ~3 size-3 stars carry the glow.
const STARS: readonly Star[] = [
  { top: 8, left: 13, size: 1, phase: 0.2, color: 'rgba(247,245,255,0.92)' },
  { top: 10, left: 73, size: 1.5, phase: 0.52, color: 'rgba(238,232,255,0.88)' },
  { top: 14, left: 38, size: 2, phase: 0.35, color: 'rgba(255,244,221,0.9)' },
  { top: 17, left: 58, size: 1, phase: 0.75, color: 'rgba(245,242,255,0.84)' },
  { top: 20, left: 23, size: 1.5, phase: 0.45, color: 'rgba(228,224,255,0.86)' },
  { top: 22, left: 84, size: 1, phase: 0.64, color: 'rgba(252,249,255,0.86)' },
  { top: 25, left: 9, size: 2, phase: 0.16, color: 'rgba(255,239,206,0.84)' },
  { top: 27, left: 49, size: 1, phase: 0.5, color: 'rgba(242,239,255,0.8)' },
  { top: 29, left: 69, size: 3, phase: 0.28, color: 'rgba(255,245,220,0.82)', glow: true },
  { top: 32, left: 17, size: 1, phase: 0.68, color: 'rgba(235,231,255,0.84)' },
  { top: 34, left: 41, size: 1.5, phase: 0.4, color: 'rgba(250,248,255,0.9)' },
  { top: 36, left: 91, size: 2, phase: 0.58, color: 'rgba(230,226,255,0.82)' },
  { top: 39, left: 29, size: 3, phase: 0.24, color: 'rgba(244,241,255,0.86)', glow: true },
  { top: 41, left: 78, size: 1.5, phase: 0.8, color: 'rgba(255,244,218,0.82)' },
  { top: 44, left: 12, size: 1, phase: 0.5, color: 'rgba(242,238,255,0.82)' },
  { top: 46, left: 55, size: 2, phase: 0.32, color: 'rgba(248,246,255,0.88)' },
  { top: 48, left: 88, size: 1, phase: 0.7, color: 'rgba(233,228,255,0.78)' },
  { top: 51, left: 34, size: 1.5, phase: 0.18, color: 'rgba(255,238,205,0.82)' },
  { top: 53, left: 66, size: 1, phase: 0.62, color: 'rgba(246,243,255,0.84)' },
  { top: 56, left: 21, size: 2, phase: 0.46, color: 'rgba(234,230,255,0.8)' },
  { top: 58, left: 74, size: 3, phase: 0.26, color: 'rgba(255,245,220,0.8)', glow: true },
  { top: 61, left: 46, size: 1, phase: 0.54, color: 'rgba(247,245,255,0.8)' },
  { top: 64, left: 8, size: 1.5, phase: 0.38, color: 'rgba(231,226,255,0.78)' },
  { top: 66, left: 82, size: 2, phase: 0.74, color: 'rgba(252,249,255,0.84)' },
  { top: 69, left: 27, size: 1, phase: 0.3, color: 'rgba(255,241,212,0.76)' },
  { top: 71, left: 59, size: 1.5, phase: 0.66, color: 'rgba(239,235,255,0.8)' },
  { top: 74, left: 15, size: 2, phase: 0.22, color: 'rgba(245,242,255,0.78)' },
  { top: 76, left: 70, size: 1, phase: 0.58, color: 'rgba(255,248,231,0.76)' },
  { top: 79, left: 39, size: 1.5, phase: 0.42, color: 'rgba(235,231,255,0.76)' },
  { top: 82, left: 87, size: 2, phase: 0.64, color: 'rgba(248,245,255,0.78)' },
  { top: 85, left: 24, size: 1, phase: 0.36, color: 'rgba(226,221,255,0.72)' },
  { top: 88, left: 53, size: 1.5, phase: 0.48, color: 'rgba(255,238,206,0.74)' },
  { top: 91, left: 11, size: 2, phase: 0.7, color: 'rgba(242,239,255,0.72)' },
  { top: 93, left: 77, size: 1, phase: 0.26, color: 'rgba(235,231,255,0.7)' },
];

/**
 * One star. Its opacity + a tiny scale ride a smooth cosine of the layer's shared
 * clock (offset by the star's phase), so a whole layer twinkles together but never
 * in lockstep — all on the UI thread. Under Reduce Motion the clock rests at 0 and
 * the star holds a still, phase-varied brightness.
 */
function StarDot({
  star,
  clock,
  spec,
}: {
  star: Star;
  clock: SharedValue<number>;
  spec: StarLayerSpec;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const t = clock.value + star.phase;
    // cos → smooth 0..1..0, continuous across the clock's 0→1 wrap (period 1).
    const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
    return {
      opacity: spec.minOpacity + (spec.maxOpacity - spec.minOpacity) * s,
      transform: [{ scale: 1 - spec.scaleAmp / 2 + spec.scaleAmp * s }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: `${star.top}%`,
          left: `${star.left}%`,
          width: star.size,
          height: star.size,
          borderRadius: star.size / 2,
          backgroundColor: star.color,
          // Glow only on the few bright near-layer stars → keeps Android overdraw
          // low (the ~22 small far/mid stars carry no shadow/elevation).
          ...(star.glow
            ? {
                shadowColor: star.color,
                shadowOpacity: 0.7,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
                elevation: 3,
              }
            : null),
        },
        animatedStyle,
      ]}
    />
  );
}

/**
 * Crescent moon whose halo slowly breathes (opacity + a small scale, ~5.6s
 * ease-in-out yoyo), echoing the family-scene halo on the first onboarding beat so
 * the intro and outro share one motion language. Reduce Motion holds it still.
 */
function BreathingMoon({ reduceMotion }: { reduceMotion: boolean }) {
  const breathe = useSharedValue(0);

  // Mutate the shared value in an effect placed BEFORE the reading useAnimatedStyle
  // (React Compiler freezes a value once it's captured into a memo).
  useEffect(() => {
    if (reduceMotion) {
      breathe.value = 0;
      return;
    }
    breathe.value = withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(breathe);
  }, [reduceMotion, breathe]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + 0.4 * breathe.value,
    transform: [{ scale: 1 + 0.05 * breathe.value }],
  }));

  return (
    <View
      style={{
        position: 'absolute',
        top: 92,
        right: 26,
        width: 76,
        height: 76,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 66,
            height: 66,
            borderRadius: 33,
            backgroundColor: 'rgba(255,223,168,0.1)',
            shadowColor: '#FFE5B9',
            shadowOpacity: 0.22,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 0 },
          },
          haloStyle,
        ]}
      />
      <Svg width={54} height={54} viewBox="0 0 54 54">
        <Circle cx={25} cy={27} r={19} fill="#FFE6B9" />
        <Circle cx={35} cy={21} r={20} fill="#1A1731" />
      </Svg>
    </View>
  );
}

/**
 * A rare, thin streaking star (mounted only when NIGHT_SKY_SHOOTING_STAR is true).
 * One slow diagonal drift + fade about every ~11s. Reduce Motion keeps it hidden.
 */
function ShootingStar({ reduceMotion }: { reduceMotion: boolean }) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withSequence(
        withDelay(9600, withTiming(1, { duration: 1500, easing: Easing.in(Easing.quad) })),
        // snap back invisibly (opacity is 0 at both ends of the streak)
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );
    return () => cancelAnimation(t);
  }, [reduceMotion, t]);

  const style = useAnimatedStyle(() => {
    const travelX = 130;
    const travelY = 74;
    const visible = t.value > 0 && t.value < 1;
    return {
      opacity: visible ? Math.sin(Math.PI * t.value) * 0.75 : 0,
      transform: [
        { translateX: t.value * travelX },
        { translateY: t.value * travelY },
        { rotate: '29deg' },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: '16%',
          left: '26%',
          width: 40,
          height: 1.6,
          borderRadius: 1,
          backgroundColor: 'rgba(255,248,231,0.95)',
        },
        style,
      ]}
    />
  );
}

export function OnboardingNightSky({ reduceMotion = false }: { reduceMotion?: boolean }) {
  // One shared clock per depth layer. Each loops 0→1 linearly; the per-star cosine
  // makes the wrap seamless. Reduce Motion rests every clock at 0 (a still frame).
  const farClock = useSharedValue(0);
  const midClock = useSharedValue(0);
  const nearClock = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      farClock.value = 0;
      midClock.value = 0;
      nearClock.value = 0;
      return;
    }
    const spin = (periodMs: number) =>
      withRepeat(withTiming(1, { duration: periodMs, easing: Easing.linear }), -1);
    farClock.value = spin(STAR_LAYERS.far.periodMs);
    midClock.value = spin(STAR_LAYERS.mid.periodMs);
    nearClock.value = spin(STAR_LAYERS.near.periodMs);
    return () => {
      cancelAnimation(farClock);
      cancelAnimation(midClock);
      cancelAnimation(nearClock);
    };
  }, [reduceMotion, farClock, midClock, nearClock]);

  const clockFor = (layer: StarLayerName) =>
    layer === 'far' ? farClock : layer === 'mid' ? midClock : nearClock;

  return (
    <View pointerEvents="none" style={FILL}>
      {/* Deep navy base — never pure #000. Native gradient (smooth, no banding). */}
      <LinearGradient
        colors={['#101124', '#17142B', '#211B3D', '#28204A']}
        locations={[0, 0.46, 0.78, 1]}
        start={{ x: 0.18, y: 0 }}
        end={{ x: 0.82, y: 1 }}
        style={FILL}
      />
      <View style={[FILL, { backgroundColor: 'rgba(7,8,22,0.24)' }]} />

      <BreathingMoon reduceMotion={reduceMotion} />

      {STARS.map((star, index) => {
        const layer = layerForSize(star.size);
        return (
          <StarDot
            key={`${star.top}-${star.left}-${index}`}
            star={star}
            clock={clockFor(layer)}
            spec={STAR_LAYERS[layer]}
          />
        );
      })}

      {NIGHT_SKY_SHOOTING_STAR ? <ShootingStar reduceMotion={reduceMotion} /> : null}

      {/* Bottom vignette — deep navy fading up from the base (no pure black), to lift
          contrast under the white title/body and the orange CTA. Extra alpha stops
          keep the ramp smooth so iOS/AMOLED don't band. */}
      <LinearGradient
        colors={['rgba(9,8,22,0)', 'rgba(9,8,22,0.16)', 'rgba(8,7,20,0.42)', 'rgba(8,7,20,0.62)']}
        locations={[0, 0.55, 0.82, 1]}
        style={FILL}
      />
    </View>
  );
}

export default OnboardingNightSky;
