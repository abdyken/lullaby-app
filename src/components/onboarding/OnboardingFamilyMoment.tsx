/**
 * OnboardingFamilyMoment — an original, Lullaby-styled vector illustration for the
 * first onboarding beat (visual identity, not Phase 1B).
 *
 * It says, before a single word is read, what this app is: two caregivers holding
 * a newborn under a soft glow, with a warm heart floating above. Everything is
 * built from the existing primitives — `react-native-svg` shapes + theme tokens —
 * so there are no new dependencies and no remote/static image assets. The figures
 * are abstract rounded silhouettes (no faces), which keeps it premium and calm
 * rather than childish or clip-arty.
 *
 * Night-safe: the whole palette swaps with the resolved `mode`, so the scene reads
 * intentionally on both the cream day scaffold and the low-glare navy night
 * scaffold (warm peach family in day, indigo family + crescent moon & stars at
 * night). It must never overpower the `<Orb>` protagonist or the CTA, so it sits
 * quietly in the beat step's flexible middle zone.
 *
 * Motion is a single, barely-perceptible heart float/pulse. Under Reduce Motion
 * the loop never starts and the driver rests at 0, so the heart sits still — same
 * latch discipline as the orb's frozen breathe.
 */
import { useEffect, useState } from 'react';
import { Animated, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';

import type { SurfaceMode } from '@/theme';

/** Illustration coordinate space. Width:height ≈ 1.47 — wide and low so it never
 *  pushes the CTA or competes with the taller orb above it. */
const VIEW_W = 220;
const VIEW_H = 150;

type FamilyPalette = {
  glow: string;
  bodyBack: string;
  headBack: string;
  bodyFront: string;
  headFront: string;
  bundle: string;
  babyHead: string;
  heart: string;
  moon: string;
  star: string;
};

/** Day = warm peach family on cream; night = calm indigo family lit by a glow +
 *  crescent moon. Heads are a shade lighter than bodies so the silhouettes read
 *  without hard borders (app rule: separation via tone, not outlines). */
const PALETTES: Record<SurfaceMode, FamilyPalette> = {
  day: {
    glow: '#FFE6CE',
    bodyBack: '#FFD2A6',
    headBack: '#FFDEBA',
    bodyFront: '#FF9E5E',
    headFront: '#FFB582',
    bundle: '#FFF4E8',
    babyHead: '#FFE2C4',
    heart: '#FF7A3D',
    moon: '#FFFFFF',
    star: '#FFFFFF',
  },
  night: {
    glow: '#2F2D54',
    bodyBack: '#444A92',
    headBack: '#565CAD',
    bodyFront: '#5560C6',
    headFront: '#7C84DA',
    bundle: '#E9EBFB',
    babyHead: '#CFD4F2',
    // a warm heart stays warm at night — the one point of warmth on a cool scene
    heart: '#FF9E5E',
    moon: '#EEF0FF',
    star: '#C9CEFF',
  },
};

type Props = {
  /** Resolved surface — drives the whole palette. Defaults to day. */
  mode?: SurfaceMode;
  /** When true the heart sits still (no loop). Defaults to false. */
  reduceMotion?: boolean;
  /** Cap so the scene never stretches uncomfortably wide on tablets. */
  maxWidth?: number;
  style?: ViewStyle;
};

export function OnboardingFamilyMoment({
  mode = 'day',
  reduceMotion = false,
  maxWidth = 260,
  style,
}: Props) {
  const p = PALETTES[mode];

  // One subtle driver for the floating heart. Rests at 0 (its at-rest pose) when
  // Reduce Motion is on, so disabling motion flattens rather than freezes mid-pose.
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2600, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reduceMotion]);

  const heartTranslate = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const heartScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] });

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Two parents holding their newborn under a soft glow"
      style={[
        { width: '100%', maxWidth, aspectRatio: VIEW_W / VIEW_H, alignSelf: 'center' },
        style,
      ]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
        <Defs>
          <RadialGradient id="famGlow" cx="50%" cy="46%" r="62%">
            <Stop offset="0%" stopColor={p.glow} stopOpacity={mode === 'night' ? 0.95 : 0.85} />
            <Stop offset="100%" stopColor={p.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* soft glow / night bubble — the warmth the family sits inside */}
        <Ellipse cx={110} cy={86} rx={104} ry={66} fill="url(#famGlow)" />

        {/* night-only brand ornament: crescent moon + stars (reuses the orb's
            proven crescent path, scaled down via a transform) */}
        {mode === 'night' && (
          <>
            <G transform="translate(161 14) scale(0.2)">
              <Path d="M89 14a74 74 0 1 0 68 102 58 58 0 0 1-68-102Z" fill={p.moon} opacity={0.92} />
            </G>
            <Circle cx={150} cy={26} r={1.7} fill={p.star} opacity={0.85} />
            <Circle cx={197} cy={52} r={1.5} fill={p.star} opacity={0.75} />
            <Circle cx={159} cy={56} r={1.2} fill={p.star} opacity={0.7} />
          </>
        )}

        {/* back caregiver (slightly lower head → reads as behind) */}
        <Path d="M104 150 C104 116 120 96 140 96 C160 96 176 116 176 150 Z" fill={p.bodyBack} />
        <Circle cx={140} cy={76} r={16} fill={p.headBack} />

        {/* front caregiver (taller, closer) */}
        <Path d="M44 150 C44 108 62 86 88 86 C114 86 130 108 130 150 Z" fill={p.bodyFront} />
        <Circle cx={86} cy={63} r={19} fill={p.headFront} />

        {/* the newborn, cradled across both — a swaddle bundle + small head peeking
            out toward the front parent's chest */}
        <G transform="rotate(-15 118 120)">
          <Ellipse cx={118} cy={120} rx={27} ry={17} fill={p.bundle} />
        </G>
        <Circle cx={99} cy={109} r={11} fill={p.babyHead} />
      </Svg>

      {/* floating heart — the single subtle motion; flat under Reduce Motion */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '20%',
          left: 0,
          right: 0,
          alignItems: 'center',
          transform: [{ translateY: heartTranslate }, { scale: heartScale }],
        }}>
        <Svg width="13%" style={{ aspectRatio: 1 }} viewBox="0 0 24 24">
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
