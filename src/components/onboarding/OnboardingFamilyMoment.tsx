/**
 * OnboardingFamilyMoment — an original, Lullaby-styled "family care moment" for the
 * first onboarding beat (visual identity, not Phase 1B).
 *
 * Before a single word is read it should land the whole premise: a caregiver
 * cradling a swaddled, sleeping newborn — warm, safe, calm. It's a tiny layered
 * scene, not an icon: a soft layered glow, a second caregiver leaning in, the main
 * caregiver with a bowed head + peaceful face, the swaddled baby with closed eyes
 * resting in the crook of an arm, a grounding shadow, and a warm heart drifting
 * above. Built only from `react-native-svg` shapes + theme tokens — no new
 * dependencies, no image assets.
 *
 * One warm palette, both surfaces: the family deliberately does NOT swap into a
 * dark variant. The figures stay warm and consistent on the cream day scaffold and
 * the navy night scaffold alike; the only mode-aware touch is a subtle neutral
 * backplate that fades up on the night surface so the warm family keeps its
 * contrast there (it's fully transparent on cream, so day is unchanged).
 *
 * Motion is barely-there and runs on Reanimated (UI thread, 60fps, identical on
 * iOS + Android): the soft peach halo slowly breathes (~1.0→1.04 on a ~4s loop),
 * the caregiver+baby group breathes, and the heart does a soft double-beat every
 * few seconds. Every loop is gated on Reduce Motion (the OS setting via
 * useReducedMotion, OR the `reduceMotion` prop); the drivers then rest at their
 * neutral pose (0 → scale 1 / translate 0), so disabling motion yields a still —
 * and still beautiful — frame, never a frozen-mid-pose one.
 */
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';

import type { SurfaceMode } from '@/theme';

/** Illustration coordinate space. Width:height ≈ 1.47 — wide and low so it never
 *  pushes the CTA down or competes with the taller orb above it. Kept identical
 *  across revisions so refining the art causes no layout shift. */
const VIEW_W = 220;
const VIEW_H = 150;

/** A small whole-head offset that seats the baby head (and all its features,
 *  which keep their own relative placement) inside the white swaddle opening.
 *  This moves the head as one object — it does not re-center the face. */
const BABY_HEAD_OFFSET_X = -2;
const BABY_HEAD_OFFSET_Y = 0;

/** A single warm palette used in every surface. Heads sit a shade lighter than
 *  bodies so the figures read by tone, not outlines (app rule: separation via
 *  shadow + cream, not hard borders). Colors stay soft and low-saturation — warm
 *  peach/blush throughout, no cartoon primaries, no dark recolor. */
const P = {
  glow: '#FFE6CE',
  glowInner: '#FFF0DC',
  /** warm near-white that lifts the family off a dark surface (fades in on night) */
  backplate: '#FFF6EC',
  cloud: '#F7E2CE',
  // background caregiver — muted so the front pair stays the focus
  bodyBack: '#F9C193',
  headBack: '#FBCEA0',
  // soft warm-brown / auburn hair so it frames the faces and reads as hair, not
  // skin — never a harsh black block
  hairBack: '#A86A42',
  // front caregiver
  bodyFront: '#F4853C',
  headFront: '#FFB082',
  hair: '#955A33',
  arm: '#FA9351',
  // swaddle + baby
  bundle: '#FFF2E2',
  bundleHi: '#FFFFFF',
  bundleFold: '#E6C3A2',
  babyHead: '#FFE1C2',
  babyHair: '#E8A064',
  // shared ink / accents
  shadow: 'rgba(120,70,40,0.16)',
  faceInk: 'rgba(94,58,44,0.62)',
  blush: 'rgba(255,128,94,0.5)',
  heart: '#FF7333',
} as const;

type Props = {
  /** Resolved surface. Only tunes the neutral readability backplate — the family
   *  art itself is identical in both modes. Defaults to day. */
  mode?: SurfaceMode;
  /** When true both loops stay off and the scene renders as a calm still. */
  reduceMotion?: boolean;
  /** Cap so the scene never stretches uncomfortably wide on tablets. */
  maxWidth?: number;
  style?: ViewStyle;
};

export function OnboardingFamilyMoment({
  mode = 'day',
  reduceMotion: reduceMotionProp = false,
  maxWidth = 264,
  style,
}: Props) {
  const night = mode === 'night';

  // Reduce Motion = the OS setting (Reanimated's useReducedMotion, called
  // unconditionally) OR the caller's prop. Either one holds every driver at its
  // neutral rest, so the scene renders a still, intentional frame.
  const osReduceMotion = useReducedMotion();
  const still = reduceMotionProp || osReduceMotion;

  // Calm shared-value drivers (UI thread). Each rests at 0 → its neutral pose.
  const breathe = useSharedValue(0); // caregiver + baby group
  const breatheBack = useSharedValue(0); // second caregiver (slower, phase-offset)
  const halo = useSharedValue(0); // breathing peach backdrop
  const heart = useSharedValue(0); // soft double-beat pulse

  useEffect(() => {
    if (still) {
      // Hold each driver at its neutral rest → a calm, deliberate still frame.
      breathe.value = 0;
      breatheBack.value = 0;
      halo.value = 0;
      heart.value = 0;
      return;
    }
    const easeInOut = Easing.inOut(Easing.ease);
    // Slow yoyo breaths — low amplitude; she lags ~500ms so it's never lockstep.
    breathe.value = withRepeat(withTiming(1, { duration: 1900, easing: easeInOut }), -1, true);
    breatheBack.value = withDelay(
      500,
      withRepeat(withTiming(1, { duration: 2050, easing: easeInOut }), -1, true),
    );
    // ~4s halo breath (2s in / 2s out), like a sleeping baby.
    halo.value = withRepeat(withTiming(1, { duration: 2000, easing: easeInOut }), -1, true);
    // A soft double-beat (up·down·up·down) then a long rest → about every 3.2s.
    heart.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 140, easing: easeInOut }),
        withTiming(0, { duration: 180, easing: easeInOut }),
        withTiming(1, { duration: 140, easing: easeInOut }),
        withTiming(0, { duration: 180, easing: easeInOut }),
        withTiming(0, { duration: 2600 }),
      ),
      -1,
    );
    return () => {
      cancelAnimation(breathe);
      cancelAnimation(breatheBack);
      cancelAnimation(halo);
      cancelAnimation(heart);
    };
  }, [still, breathe, breatheBack, halo, heart]);

  const groupStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(breathe.value, [0, 1], [0, -3]) },
      { scale: interpolate(breathe.value, [0, 1], [1, 1.016]) },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(breatheBack.value, [0, 1], [0, -2]) },
      { scale: interpolate(breatheBack.value, [0, 1], [1, 1.012]) },
    ],
  }));
  // The backdrop halo gently swells + softens — the one "breath" the eye reads.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(halo.value, [0, 1], [1, 0.9]),
    transform: [{ scale: interpolate(halo.value, [0, 1], [1, 1.04]) }],
  }));
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(heart.value, [0, 1], [1, 1.12]) }],
  }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="A parent cradling their swaddled, sleeping newborn under a soft glow"
      style={[
        { width: '100%', maxWidth, aspectRatio: VIEW_W / VIEW_H, alignSelf: 'center' },
        style,
      ]}>
      {/* ── Back layer, split so ONLY the halo breathes. Same draw order as before
            (backplate → halo → cloud); layout/geometry unchanged. ── */}

      {/* 1) neutral readability backplate — invisible on cream (day), a soft warm
            lift behind the family on navy night. Static. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
        <Defs>
          <RadialGradient id="famBackplate" cx="50%" cy="56%" r="60%">
            <Stop offset="0%" stopColor={P.backplate} stopOpacity={night ? 0.5 : 0} />
            <Stop offset="68%" stopColor={P.backplate} stopOpacity={night ? 0.28 : 0} />
            <Stop offset="100%" stopColor={P.backplate} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* backplate first (under the warm glow) so it only lifts shadows */}
        <Ellipse cx={108} cy={98} rx={98} ry={62} fill="url(#famBackplate)" />
      </Svg>

      {/* 2) the breathing peach halo — a wide soft bloom + a brighter core, on its
            own Reanimated layer so it gently swells (~1.0→1.04) + softens on a ~4s
            loop without nudging the backplate, cloud, or family off their marks. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, haloStyle]}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          <Defs>
            <RadialGradient id="famGlowOuter" cx="50%" cy="48%" r="64%">
              <Stop offset="0%" stopColor={P.glow} stopOpacity={night ? 0.92 : 0.8} />
              <Stop offset="100%" stopColor={P.glow} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="famGlowInner" cx="48%" cy="58%" r="46%">
              <Stop offset="0%" stopColor={P.glowInner} stopOpacity={night ? 0.55 : 0.72} />
              <Stop offset="100%" stopColor={P.glowInner} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {/* layered halo → depth: a wide soft bloom + a brighter core behind the pair */}
          <Ellipse cx={108} cy={82} rx={110} ry={72} fill="url(#famGlowOuter)" />
          <Ellipse cx={104} cy={94} rx={70} ry={52} fill="url(#famGlowInner)" />
        </Svg>
      </Animated.View>

      {/* 3) a soft grounding cloud the family rests on — barely-there, just enough
            to seat the scene rather than have it float in a void. Static, drawn
            above the halo exactly as before. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
        <Ellipse cx={108} cy={152} rx={98} ry={28} fill={P.cloud} opacity={night ? 0.5 : 0.7} />
      </Svg>

      {/* ── Second-caregiver layer: she "leans in from behind", so she sits above the
            glow/cloud but below the front caregiver+baby. Lifted into her own
            Animated layer (identical paths, identical layering) so she breathes too,
            on a slightly slower + phase-offset driver. ── */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backStyle]}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          {/* second caregiver — softer, leaning in from behind so the moment reads as
              "parents", not a lone figure. Hair cap frames the face; the face itself
              is grouped about the head centre (mirrored offsets → centered + level). */}
          <Path d="M122 150 C122 118 138 100 156 100 C174 100 186 118 186 150 Z" fill={P.bodyBack} />
          {/* longer hair — a soft drape behind the head falling down the sides to the
              shoulders, dipping at the centre so it never reaches under the chin.
              Drawn before the head, so it frames the face without covering it. */}
          <Path
            d="M138 70 C133 80 134 96 141 104 C146 100 150 99 156 99 C162 99 166 100 171 104 C178 96 179 80 174 70 C168 64 144 64 138 70 Z"
            fill={P.hairBack}
          />
          <Circle cx={156} cy={71} r={19} fill={P.hairBack} />
          <Circle cx={156} cy={80} r={16} fill={P.headBack} />
          <G transform="translate(156 80)">
            <Path d="M-6 -1 Q-3.5 1.4 -1 -1" stroke={P.faceInk} strokeWidth={1.5} strokeLinecap="round" fill="none" />
            <Path d="M1 -1 Q3.5 1.4 6 -1" stroke={P.faceInk} strokeWidth={1.5} strokeLinecap="round" fill="none" />
            <Path d="M-1 1 Q0 2.6 1 1" stroke={P.faceInk} strokeWidth={1.2} strokeLinecap="round" fill="none" />
            <Path d="M-3.5 4.6 Q0 7 3.5 4.6" stroke={P.faceInk} strokeWidth={1.4} strokeLinecap="round" fill="none" />
            <Circle cx={-7.5} cy={2.4} r={2.2} fill={P.blush} />
            <Circle cx={7.5} cy={2.4} r={2.2} fill={P.blush} />
          </G>
        </Svg>
      </Animated.View>

      {/* ── Mid layer: the caregiver + baby group. This is what breathes. ── */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, groupStyle]}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          {/* grounding shadow beneath the bundle → the baby has weight */}
          <Ellipse cx={110} cy={141} rx={36} ry={7.5} fill={P.shadow} />

          {/* main caregiver torso/shoulders */}
          <Path d="M38 150 C38 112 56 92 84 92 C112 92 128 110 128 150 Z" fill={P.bodyFront} />

          {/* head, gently bowed (group tilted), with a calm face: soft hair cap that
              frames but never covers the face, two closed eyes, a small nose, a
              gentle smile, and a touch of blush */}
          <G transform="rotate(7 78 64)">
            <Circle cx={78} cy={55} r={23} fill={P.hair} />
            <Circle cx={78} cy={64} r={20} fill={P.headFront} />
            {/* face grouped about the head centre (78,64) with mirrored offsets so
                the eyes stay level and the nose/smile stay centered under them */}
            <G transform="translate(78 64)">
              <Path d="M-8 -2 Q-5 1 -2 -2" stroke={P.faceInk} strokeWidth={1.7} strokeLinecap="round" fill="none" />
              <Path d="M2 -2 Q5 1 8 -2" stroke={P.faceInk} strokeWidth={1.7} strokeLinecap="round" fill="none" />
              <Path d="M-1.4 1 Q0 2.8 1.4 2.2" stroke={P.faceInk} strokeWidth={1.4} strokeLinecap="round" fill="none" />
              <Path d="M-5 7 Q0 11 5 7" stroke={P.faceInk} strokeWidth={1.8} strokeLinecap="round" fill="none" />
              <Circle cx={-9} cy={5} r={2.8} fill={P.blush} />
              <Circle cx={9} cy={5} r={2.8} fill={P.blush} />
            </G>
          </G>

          {/* the swaddled newborn, tilted, nestled against the chest. A hood of
              swaddle behind the head + fabric folds + a soft top highlight give the
              bundle real form rather than a flat blob. */}
          <Circle cx={94} cy={98} r={14} fill={P.bundle} />
          <G transform="rotate(-22 110 110)">
            <Ellipse cx={110} cy={110} rx={27} ry={18} fill={P.bundle} />
            {/* curved blanket folds — a wrapped, swaddled newborn, not a smooth pod */}
            <Path d="M90 106 Q110 116 130 107" stroke={P.bundleFold} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.7} />
            <Path d="M94 116 Q110 123 126 116" stroke={P.bundleFold} strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.55} />
            <Path d="M99 100 Q112 105 124 100" stroke={P.bundleFold} strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.45} />
            <Ellipse cx={102} cy={103} rx={16} ry={6.5} fill={P.bundleHi} opacity={0.5} />
          </G>

          {/* the cradling forearm sweeping across the front, under the bundle */}
          <Path
            d="M52 122 C62 140 92 146 120 134"
            stroke={P.arm}
            strokeWidth={15}
            strokeLinecap="round"
            fill="none"
          />

          {/* baby head + sleeping face, wrapped as one group and moved together by
              BABY_HEAD_OFFSET so the whole head seats naturally in the white swaddle
              opening. The inner face group keeps its prior relative placement (a
              touch left of the head centre); only the whole head moves. */}
          <G transform={`translate(${BABY_HEAD_OFFSET_X} ${BABY_HEAD_OFFSET_Y})`}>
            <Circle cx={96} cy={96} r={12} fill={P.babyHead} />
            <G transform="translate(89 96)">
              <Path d="M-5 -9 Q0 -13.5 5 -9" stroke={P.babyHair} strokeWidth={1.6} strokeLinecap="round" fill="none" />
              <Path d="M-4.5 0 Q-2.5 1.8 -0.5 0" stroke={P.faceInk} strokeWidth={1.3} strokeLinecap="round" fill="none" />
              <Path d="M0.5 0 Q2.5 1.8 4.5 0" stroke={P.faceInk} strokeWidth={1.3} strokeLinecap="round" fill="none" />
              <Path d="M-2.5 5 Q0 7 2.5 5" stroke={P.faceInk} strokeWidth={1.1} strokeLinecap="round" fill="none" />
              <Circle cx={-7} cy={3} r={2} fill={P.blush} />
              <Circle cx={7} cy={3} r={2} fill={P.blush} />
            </G>
          </G>
        </Svg>
      </Animated.View>

      {/* ── Foreground: the warm heart, doing a soft double-beat above the pair.
            Scale-only (it pulses in place — its anchor never moves). ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: '15%',
            left: 0,
            right: 0,
            alignItems: 'center',
          },
          heartStyle,
        ]}>
        <Svg width="11%" style={{ aspectRatio: 1 }} viewBox="0 0 24 24">
          <Path
            d="M12 21.6 C12 21.6 3.2 15.4 3.2 9 C3.2 6 5.6 3.8 8.4 3.8 C10 3.8 11.4 4.6 12 5.8 C12.6 4.6 14 3.8 15.6 3.8 C18.4 3.8 20.8 6 20.8 9 C20.8 15.4 12 21.6 12 21.6 Z"
            fill={P.heart}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export default OnboardingFamilyMoment;
