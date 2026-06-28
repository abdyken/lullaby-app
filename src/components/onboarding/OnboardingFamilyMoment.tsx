/**
 * OnboardingFamilyMoment — an original, Lullaby-styled "night care moment" for the
 * first onboarding beat (visual identity, not Phase 1B).
 *
 * Before a single word is read it should land the whole premise: a caregiver
 * cradling a swaddled, sleeping newborn through the quiet night shift — warm,
 * safe, calm. It's a tiny layered scene, not an icon: a soft layered glow, a
 * second caregiver leaning in as a muted silhouette, the main caregiver with a
 * bowed head + peaceful face, the swaddled baby with closed eyes resting in the
 * crook of an arm, a grounding shadow, and a warm heart drifting above. Built
 * only from `react-native-svg` shapes + theme tokens — no new dependencies, no
 * image assets.
 *
 * Night-safe: the entire palette swaps with the resolved `mode` (warm peach
 * family on cream by day; muted indigo family lit by a crescent moon + stars at
 * night), so both surfaces read intentionally rather than one being a recolor of
 * the other.
 *
 * Motion is layered but barely-there: the caregiver+baby group breathes, the
 * heart drifts and pulses, and two stars trade a slow shimmer. Every loop is
 * gated on `reduceMotion`; the transform drivers rest at their neutral pose (0 →
 * scale 1 / translate 0) and the stars fall back to a calm static opacity, so
 * disabling motion yields a still — and still beautiful — frame, never a
 * frozen-mid-pose one.
 */
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';

import type { SurfaceMode } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Illustration coordinate space. Width:height ≈ 1.47 — wide and low so it never
 *  pushes the CTA down or competes with the taller orb above it. Kept identical to
 *  the previous version so enriching the art causes no layout shift. */
const VIEW_W = 220;
const VIEW_H = 150;

type FamilyPalette = {
  glow: string;
  glowInner: string;
  cloud: string;
  bodyBack: string;
  headBack: string;
  bodyFront: string;
  headFront: string;
  hair: string;
  arm: string;
  bundle: string;
  bundleHi: string;
  bundleFold: string;
  babyHead: string;
  shadow: string;
  faceInk: string;
  blush: string;
  heart: string;
  markGlow: string;
  moon: string;
  star: string;
};

/** Day = warm peach/blush family on cream; night = calm muted-indigo family lit by
 *  a glow + crescent moon. Heads sit a shade lighter than bodies so the silhouettes
 *  read by tone, not outlines (app rule: separation via shadow + cream, not hard
 *  borders). Colors stay soft and low-saturation — no cartoon primaries. */
const PALETTES: Record<SurfaceMode, FamilyPalette> = {
  day: {
    glow: '#FFE6CE',
    glowInner: '#FFF0DC',
    cloud: '#F7E2CE',
    // deepened a step so the family reads with confidence on the cream scaffold
    bodyBack: '#F9C193',
    headBack: '#FBCEA0',
    bodyFront: '#F4853C',
    headFront: '#FFB082',
    hair: '#DF6E2C',
    arm: '#FA9351',
    bundle: '#FFF2E2',
    bundleHi: '#FFFFFF',
    bundleFold: '#E6C3A2',
    babyHead: '#FFE1C2',
    shadow: 'rgba(120,70,40,0.16)',
    faceInk: 'rgba(94,58,44,0.62)',
    blush: 'rgba(255,128,94,0.5)',
    heart: '#FF7333',
    markGlow: '#FFD79A',
    moon: '#FFFFFF',
    star: '#FFFFFF',
  },
  night: {
    glow: '#2F2D54',
    glowInner: '#3C3B69',
    cloud: '#2B2A4A',
    bodyBack: '#3C4290',
    headBack: '#525AA6',
    bodyFront: '#5560C6',
    headFront: '#838BDF',
    hair: '#3A43A6',
    arm: '#6A72CE',
    bundle: '#EAECFC',
    bundleHi: '#FFFFFF',
    bundleFold: '#C3C8EC',
    babyHead: '#DCE0F6',
    shadow: 'rgba(0,0,0,0.26)',
    faceInk: 'rgba(24,22,50,0.62)',
    blush: 'rgba(255,150,120,0.4)',
    // a warm heart stays warm at night — the one point of warmth on a cool scene
    heart: '#FF9E5E',
    markGlow: '#C9CEFF',
    moon: '#EEF0FF',
    star: '#C9CEFF',
  },
};

type Props = {
  /** Resolved surface — drives the whole palette. Defaults to day. */
  mode?: SurfaceMode;
  /** When true all loops stay off and the scene renders as a calm still. */
  reduceMotion?: boolean;
  /** Cap so the scene never stretches uncomfortably wide on tablets. */
  maxWidth?: number;
  style?: ViewStyle;
};

export function OnboardingFamilyMoment({
  mode = 'day',
  reduceMotion = false,
  maxWidth = 264,
  style,
}: Props) {
  const p = PALETTES[mode];
  const night = mode === 'night';

  // Three calm drivers. Each rests at 0 → its neutral pose, so Reduce Motion just
  // never starts the loops and the scene holds a still, intentional frame.
  const [breathe] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const [twinkle] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = (value: Animated.Value, halfMs: number, useNativeDriver: boolean) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration: halfMs, useNativeDriver }),
          Animated.timing(value, { toValue: 0, duration: halfMs, useNativeDriver }),
        ]),
      );
    // group breathe + heart drift run on the native driver (transforms); the star
    // shimmer animates an SVG opacity prop, which the native driver can't own.
    const animations = [
      loop(breathe, 3000, true),
      loop(pulse, 2400, true),
      ...(night ? [loop(twinkle, 1700, false)] : []),
    ];
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [breathe, pulse, twinkle, reduceMotion, night]);

  const groupScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.014] });
  const groupTranslate = breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -2.4] });
  const heartTranslate = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const heartScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  // two stars trade the shimmer so the sky feels alive without blinking in unison
  const starOpacityA = twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] });
  const starOpacityB = twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.4] });

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="A parent cradling their swaddled, sleeping newborn under a soft night glow"
      style={[
        { width: '100%', maxWidth, aspectRatio: VIEW_W / VIEW_H, alignSelf: 'center' },
        style,
      ]}>
      {/* ── Back layer: glow, night sky, the second caregiver. Mostly static. ── */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
        <Defs>
          <RadialGradient id="famGlowOuter" cx="50%" cy="48%" r="64%">
            <Stop offset="0%" stopColor={p.glow} stopOpacity={night ? 0.92 : 0.8} />
            <Stop offset="100%" stopColor={p.glow} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="famGlowInner" cx="48%" cy="58%" r="46%">
            <Stop offset="0%" stopColor={p.glowInner} stopOpacity={night ? 0.6 : 0.72} />
            <Stop offset="100%" stopColor={p.glowInner} stopOpacity={0} />
          </RadialGradient>
          {/* soft halo behind the little Lullaby orb/moon mark */}
          <RadialGradient id="famMarkHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={p.markGlow} stopOpacity={night ? 0.5 : 0.42} />
            <Stop offset="100%" stopColor={p.markGlow} stopOpacity={0} />
          </RadialGradient>
          {/* warm day orb — same stops as the hero orb's day body, so the little
              mark reads as a sibling of the orb at the top of the screen */}
          <RadialGradient id="famOrb" cx="42%" cy="38%" r="64%">
            <Stop offset="0%" stopColor="#FFF1D6" />
            <Stop offset="46%" stopColor="#FFC15E" />
            <Stop offset="100%" stopColor="#FF9A3D" />
          </RadialGradient>
        </Defs>

        {/* layered halo → depth: a wide soft bloom + a brighter core behind the pair */}
        <Ellipse cx={108} cy={82} rx={110} ry={72} fill="url(#famGlowOuter)" />
        <Ellipse cx={104} cy={94} rx={70} ry={52} fill="url(#famGlowInner)" />

        {/* a soft grounding cloud the family rests on — barely-there, just enough to
            seat the scene rather than have it float in a void */}
        <Ellipse cx={108} cy={152} rx={98} ry={28} fill={p.cloud} opacity={night ? 0.55 : 0.7} />

        {/* the little Lullaby orb/moon mark in its own halo — a warm orb by day, a
            cool crescent at night (reuses the hero orb's proven crescent path,
            scaled down) — so the scene is tied to the brand, not just a heart */}
        <Ellipse cx={180} cy={30} rx={25} ry={25} fill="url(#famMarkHalo)" />
        {night ? (
          <G transform="translate(165 12) scale(0.2)">
            <Path d="M89 14a74 74 0 1 0 68 102 58 58 0 0 1-68-102Z" fill={p.moon} opacity={0.95} />
          </G>
        ) : (
          <Circle cx={180} cy={30} r={13} fill="url(#famOrb)" />
        )}

        {/* night context: a small scatter of stars, two of which slowly shimmer */}
        {night && (
          <>
            <Circle cx={44} cy={34} r={1.5} fill={p.star} opacity={0.7} />
            <Circle cx={150} cy={22} r={1.2} fill={p.star} opacity={0.55} />
            <Circle cx={150} cy={58} r={1.3} fill={p.star} opacity={0.6} />
            {reduceMotion ? (
              <>
                <Circle cx={64} cy={22} r={1.9} fill={p.star} opacity={0.8} />
                <Circle cx={206} cy={54} r={1.7} fill={p.star} opacity={0.8} />
              </>
            ) : (
              <>
                <AnimatedCircle cx={64} cy={22} r={1.9} fill={p.star} opacity={starOpacityA} />
                <AnimatedCircle cx={206} cy={54} r={1.7} fill={p.star} opacity={starOpacityB} />
              </>
            )}
          </>
        )}

        {/* second caregiver — softer, muted, leaning in from behind so the moment
            reads as "parents", not a lone figure, without cluttering the front */}
        <Path d="M122 150 C122 118 138 100 156 100 C174 100 186 118 186 150 Z" fill={p.bodyBack} />
        <Circle cx={156} cy={80} r={16} fill={p.headBack} />
      </Svg>

      {/* ── Mid layer: the caregiver + baby group. This is what breathes. ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateY: groupTranslate }, { scale: groupScale }] },
        ]}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          {/* grounding shadow beneath the bundle → the baby has weight */}
          <Ellipse cx={110} cy={141} rx={36} ry={7.5} fill={p.shadow} />

          {/* main caregiver torso/shoulders */}
          <Path d="M38 150 C38 112 56 92 84 92 C112 92 128 110 128 150 Z" fill={p.bodyFront} />

          {/* head, bowed toward the baby (whole group tilted), with a peaceful face:
              one closed eye, a soft smile, a touch of blush */}
          <G transform="rotate(7 78 64)">
            {/* a soft hair cap (a deeper circle peeking above the head) gives the
                caregiver real form + a tender bowed posture, not a flat ball */}
            <Circle cx={78} cy={58} r={22} fill={p.hair} />
            <Circle cx={78} cy={64} r={20} fill={p.headFront} />
            <Path d="M82 66 Q86 69 90 66" stroke={p.faceInk} strokeWidth={1.6} strokeLinecap="round" fill="none" />
            <Path d="M80 75 Q85 79 90 75" stroke={p.faceInk} strokeWidth={1.6} strokeLinecap="round" fill="none" />
            <Circle cx={90} cy={72} r={3} fill={p.blush} />
          </G>

          {/* the swaddled newborn, tilted, nestled against the chest. A hood of
              swaddle behind the head + fabric folds + a soft top highlight give the
              bundle real form rather than a flat blob. */}
          <Circle cx={94} cy={98} r={14} fill={p.bundle} />
          <G transform="rotate(-22 110 110)">
            <Ellipse cx={110} cy={110} rx={27} ry={18} fill={p.bundle} />
            {/* curved blanket folds — a wrapped, swaddled newborn, not a smooth pod */}
            <Path d="M90 106 Q110 116 130 107" stroke={p.bundleFold} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.7} />
            <Path d="M94 116 Q110 123 126 116" stroke={p.bundleFold} strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.55} />
            <Path d="M99 100 Q112 105 124 100" stroke={p.bundleFold} strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.45} />
            <Ellipse cx={102} cy={103} rx={16} ry={6.5} fill={p.bundleHi} opacity={0.5} />
          </G>

          {/* the cradling forearm sweeping across the front, under the bundle */}
          <Path
            d="M52 122 C62 140 92 146 120 134"
            stroke={p.arm}
            strokeWidth={15}
            strokeLinecap="round"
            fill="none"
          />

          {/* baby head + sleeping face (closed eyes, tiny mouth, soft cheeks) and a
              single wisp of newborn hair so it reads unmistakably as a baby */}
          <Circle cx={96} cy={96} r={12} fill={p.babyHead} />
          <Path d="M91 86 Q96 81 101 85" stroke={p.faceInk} strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.7} />
          <Path d="M90 95 Q92 97 94 95" stroke={p.faceInk} strokeWidth={1.3} strokeLinecap="round" fill="none" />
          <Path d="M98 95 Q100 97 102 95" stroke={p.faceInk} strokeWidth={1.3} strokeLinecap="round" fill="none" />
          <Path d="M94 101 Q96 102.6 98 101" stroke={p.faceInk} strokeWidth={1.1} strokeLinecap="round" fill="none" />
          <Circle cx={89} cy={99} r={2} fill={p.blush} />
          <Circle cx={102} cy={99} r={2} fill={p.blush} />
        </Svg>
      </Animated.View>

      {/* ── Foreground: the warm heart, drifting + pulsing above the pair. ── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '15%',
          left: 0,
          right: 0,
          alignItems: 'center',
          transform: [{ translateY: heartTranslate }, { scale: heartScale }],
        }}>
        <Svg width="11%" style={{ aspectRatio: 1 }} viewBox="0 0 24 24">
          <Path
            d="M12 21.6 C12 21.6 3.2 15.4 3.2 9 C3.2 6 5.6 3.8 8.4 3.8 C10 3.8 11.4 4.6 12 5.8 C12.6 4.6 14 3.8 15.6 3.8 C18.4 3.8 20.8 6 20.8 9 C20.8 15.4 12 21.6 12 21.6 Z"
            fill={p.heart}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export default OnboardingFamilyMoment;
