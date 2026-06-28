/**
 * OnboardingFamilyMoment — an original, Lullaby-styled "family care moment" for the
 * first onboarding beat (visual identity, not Phase 1B).
 *
 * Before a single word is read it should land the whole premise: a caregiver
 * cradling a swaddled, sleeping newborn — warm, safe, calm. It's a tiny layered
 * scene, not an icon: a soft layered glow, a second caregiver leaning in, the main
 * caregiver with a bowed head + peaceful face, the swaddled baby with closed eyes
 * resting in the crook of an arm, a grounding shadow, a small Lullaby orb, and a
 * warm heart drifting above. Built only from `react-native-svg` shapes + theme
 * tokens — no new dependencies, no image assets.
 *
 * One warm palette, both surfaces: the family deliberately does NOT swap into a
 * dark variant. The figures stay warm and consistent on the cream day scaffold and
 * the navy night scaffold alike; the only mode-aware touch is a subtle neutral
 * backplate that fades up on the night surface so the warm family keeps its
 * contrast there (it's fully transparent on cream, so day is unchanged).
 *
 * Motion is barely-there: the caregiver+baby group breathes and the heart drifts +
 * pulses. Both loops are gated on `reduceMotion`; the drivers rest at their neutral
 * pose (0 → scale 1 / translate 0), so disabling motion yields a still — and still
 * beautiful — frame, never a frozen-mid-pose one.
 */
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';

import type { SurfaceMode } from '@/theme';

/** Illustration coordinate space. Width:height ≈ 1.47 — wide and low so it never
 *  pushes the CTA down or competes with the taller orb above it. Kept identical
 *  across revisions so refining the art causes no layout shift. */
const VIEW_W = 220;
const VIEW_H = 150;

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
  hairBack: '#E0934F',
  // front caregiver
  bodyFront: '#F4853C',
  headFront: '#FFB082',
  hair: '#DD6E2E',
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
  markGlow: '#FFD79A',
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
  reduceMotion = false,
  maxWidth = 264,
  style,
}: Props) {
  const night = mode === 'night';

  // Two calm drivers. Each rests at 0 → its neutral pose, so Reduce Motion just
  // never starts the loops and the scene holds a still, intentional frame.
  const [breathe] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = (value: Animated.Value, halfMs: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration: halfMs, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: halfMs, useNativeDriver: true }),
        ]),
      );
    const animations = [loop(breathe, 3000), loop(pulse, 2400)];
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [breathe, pulse, reduceMotion]);

  const groupScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.014] });
  const groupTranslate = breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -2.4] });
  const heartTranslate = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const heartScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="A parent cradling their swaddled, sleeping newborn under a soft glow"
      style={[
        { width: '100%', maxWidth, aspectRatio: VIEW_W / VIEW_H, alignSelf: 'center' },
        style,
      ]}>
      {/* ── Back layer: glow, backplate, orb mark, the second caregiver. Static. ── */}
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
          {/* neutral readability backplate — invisible on cream (day), a soft warm
              lift behind the family on the navy night surface */}
          <RadialGradient id="famBackplate" cx="50%" cy="56%" r="60%">
            <Stop offset="0%" stopColor={P.backplate} stopOpacity={night ? 0.5 : 0} />
            <Stop offset="68%" stopColor={P.backplate} stopOpacity={night ? 0.28 : 0} />
            <Stop offset="100%" stopColor={P.backplate} stopOpacity={0} />
          </RadialGradient>
          {/* soft halo behind the little Lullaby orb */}
          <RadialGradient id="famMarkHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={P.markGlow} stopOpacity={night ? 0.5 : 0.42} />
            <Stop offset="100%" stopColor={P.markGlow} stopOpacity={0} />
          </RadialGradient>
          {/* the orb itself — same stops as the hero orb's day body, so the little
              mark reads as a sibling of the orb at the top of the screen */}
          <RadialGradient id="famOrb" cx="42%" cy="38%" r="64%">
            <Stop offset="0%" stopColor="#FFF1D6" />
            <Stop offset="46%" stopColor="#FFC15E" />
            <Stop offset="100%" stopColor="#FF9A3D" />
          </RadialGradient>
        </Defs>

        {/* neutral backplate first (under the warm glow) so it only lifts shadows */}
        <Ellipse cx={108} cy={98} rx={98} ry={62} fill="url(#famBackplate)" />

        {/* layered halo → depth: a wide soft bloom + a brighter core behind the pair */}
        <Ellipse cx={108} cy={82} rx={110} ry={72} fill="url(#famGlowOuter)" />
        <Ellipse cx={104} cy={94} rx={70} ry={52} fill="url(#famGlowInner)" />

        {/* a soft grounding cloud the family rests on — barely-there, just enough to
            seat the scene rather than have it float in a void */}
        <Ellipse cx={108} cy={152} rx={98} ry={28} fill={P.cloud} opacity={night ? 0.5 : 0.7} />

        {/* the little Lullaby orb in its own halo — ties the scene to the brand orb
            at the top of the screen, not just the heart */}
        <Ellipse cx={180} cy={30} rx={25} ry={25} fill="url(#famMarkHalo)" />
        <Circle cx={180} cy={30} r={13} fill="url(#famOrb)" />

        {/* second caregiver — softer, muted, leaning in from behind so the moment
            reads as "parents", not a lone figure. A soft hair cap gives it form. */}
        <Path d="M122 150 C122 118 138 100 156 100 C174 100 186 118 186 150 Z" fill={P.bodyBack} />
        <Circle cx={156} cy={75} r={18} fill={P.hairBack} />
        <Circle cx={156} cy={80} r={16} fill={P.headBack} />
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
          <Ellipse cx={110} cy={141} rx={36} ry={7.5} fill={P.shadow} />

          {/* main caregiver torso/shoulders */}
          <Path d="M38 150 C38 112 56 92 84 92 C112 92 128 110 128 150 Z" fill={P.bodyFront} />

          {/* head, gently bowed (group tilted), with a calm face: soft hair cap that
              frames but never covers the face, two closed eyes, a small nose, a
              gentle smile, and a touch of blush */}
          <G transform="rotate(7 78 64)">
            <Circle cx={78} cy={57} r={22} fill={P.hair} />
            <Circle cx={78} cy={64} r={20} fill={P.headFront} />
            <Path d="M68 62 Q72 65 76 62" stroke={P.faceInk} strokeWidth={1.6} strokeLinecap="round" fill="none" />
            <Path d="M80 62 Q84 65 88 62" stroke={P.faceInk} strokeWidth={1.6} strokeLinecap="round" fill="none" />
            <Path d="M77 65 Q78 68 80 67" stroke={P.faceInk} strokeWidth={1.3} strokeLinecap="round" fill="none" />
            <Path d="M71 73 Q78 78 85 73" stroke={P.faceInk} strokeWidth={1.7} strokeLinecap="round" fill="none" />
            <Circle cx={69} cy={70} r={2.6} fill={P.blush} />
            <Circle cx={87} cy={70} r={2.6} fill={P.blush} />
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

          {/* baby head + sleeping face — centered and symmetric inside the head: a
              soft hair wisp, two level closed eyes, a gentle smile, soft cheeks */}
          <Circle cx={96} cy={96} r={12} fill={P.babyHead} />
          <Path d="M91 87 Q96 82 101 87" stroke={P.babyHair} strokeWidth={1.6} strokeLinecap="round" fill="none" />
          <Path d="M90 96 Q92 98 94 96" stroke={P.faceInk} strokeWidth={1.3} strokeLinecap="round" fill="none" />
          <Path d="M98 96 Q100 98 102 96" stroke={P.faceInk} strokeWidth={1.3} strokeLinecap="round" fill="none" />
          <Path d="M93 101 Q96 103 99 101" stroke={P.faceInk} strokeWidth={1.1} strokeLinecap="round" fill="none" />
          <Circle cx={88} cy={99} r={2} fill={P.blush} />
          <Circle cx={104} cy={99} r={2} fill={P.blush} />
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
            fill={P.heart}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export default OnboardingFamilyMoment;
