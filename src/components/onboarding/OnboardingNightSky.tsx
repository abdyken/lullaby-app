import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const FILL = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

export const NIGHT_SKY_STAR_COUNT = 34;
export const NIGHT_SKY_TWINKLE = {
  minOpacity: 0.25,
  maxOpacity: 0.9,
  minDurationMs: 1800,
  maxDurationMs: 4200,
} as const;

type NightSkyStar = {
  top: number;
  left: number;
  size: number;
  durationMs: number;
  delayMs: number;
  phase: number;
  color: string;
  glow?: boolean;
};

const STARS: readonly NightSkyStar[] = [
  { top: 8, left: 13, size: 1, durationMs: 2600, delayMs: 0, phase: 0.2, color: 'rgba(247,245,255,0.92)' },
  { top: 10, left: 73, size: 1.5, durationMs: 3400, delayMs: 240, phase: 0.52, color: 'rgba(238,232,255,0.88)' },
  { top: 14, left: 38, size: 2, durationMs: 4100, delayMs: 540, phase: 0.35, color: 'rgba(255,244,221,0.9)' },
  { top: 17, left: 58, size: 1, durationMs: 2200, delayMs: 130, phase: 0.75, color: 'rgba(245,242,255,0.84)' },
  { top: 20, left: 23, size: 1.5, durationMs: 3800, delayMs: 760, phase: 0.45, color: 'rgba(228,224,255,0.86)' },
  { top: 22, left: 84, size: 1, durationMs: 3100, delayMs: 460, phase: 0.64, color: 'rgba(252,249,255,0.86)' },
  { top: 25, left: 9, size: 2, durationMs: 4200, delayMs: 900, phase: 0.16, color: 'rgba(255,239,206,0.84)' },
  { top: 27, left: 49, size: 1, durationMs: 1900, delayMs: 360, phase: 0.5, color: 'rgba(242,239,255,0.8)' },
  { top: 29, left: 69, size: 3, durationMs: 3600, delayMs: 650, phase: 0.28, color: 'rgba(255,245,220,0.82)', glow: true },
  { top: 32, left: 17, size: 1, durationMs: 2800, delayMs: 190, phase: 0.68, color: 'rgba(235,231,255,0.84)' },
  { top: 34, left: 41, size: 1.5, durationMs: 4000, delayMs: 820, phase: 0.4, color: 'rgba(250,248,255,0.9)' },
  { top: 36, left: 91, size: 2, durationMs: 2500, delayMs: 410, phase: 0.58, color: 'rgba(230,226,255,0.82)' },
  { top: 39, left: 29, size: 3, durationMs: 3200, delayMs: 1020, phase: 0.24, color: 'rgba(244,241,255,0.86)', glow: true },
  { top: 41, left: 78, size: 1.5, durationMs: 2100, delayMs: 310, phase: 0.8, color: 'rgba(255,244,218,0.82)' },
  { top: 44, left: 12, size: 1, durationMs: 3700, delayMs: 600, phase: 0.5, color: 'rgba(242,238,255,0.82)' },
  { top: 46, left: 55, size: 2, durationMs: 3000, delayMs: 720, phase: 0.32, color: 'rgba(248,246,255,0.88)' },
  { top: 48, left: 88, size: 1, durationMs: 1800, delayMs: 160, phase: 0.7, color: 'rgba(233,228,255,0.78)' },
  { top: 51, left: 34, size: 1.5, durationMs: 3900, delayMs: 1100, phase: 0.18, color: 'rgba(255,238,205,0.82)' },
  { top: 53, left: 66, size: 1, durationMs: 2700, delayMs: 500, phase: 0.62, color: 'rgba(246,243,255,0.84)' },
  { top: 56, left: 21, size: 2, durationMs: 3500, delayMs: 270, phase: 0.46, color: 'rgba(234,230,255,0.8)' },
  { top: 58, left: 74, size: 3, durationMs: 4200, delayMs: 1240, phase: 0.26, color: 'rgba(255,245,220,0.8)', glow: true },
  { top: 61, left: 46, size: 1, durationMs: 2300, delayMs: 680, phase: 0.54, color: 'rgba(247,245,255,0.8)' },
  { top: 64, left: 8, size: 1.5, durationMs: 3300, delayMs: 440, phase: 0.38, color: 'rgba(231,226,255,0.78)' },
  { top: 66, left: 82, size: 2, durationMs: 2900, delayMs: 860, phase: 0.74, color: 'rgba(252,249,255,0.84)' },
  { top: 69, left: 27, size: 1, durationMs: 4100, delayMs: 980, phase: 0.3, color: 'rgba(255,241,212,0.76)' },
  { top: 71, left: 59, size: 1.5, durationMs: 2600, delayMs: 220, phase: 0.66, color: 'rgba(239,235,255,0.8)' },
  { top: 74, left: 15, size: 2, durationMs: 3800, delayMs: 700, phase: 0.22, color: 'rgba(245,242,255,0.78)' },
  { top: 76, left: 70, size: 1, durationMs: 2000, delayMs: 520, phase: 0.58, color: 'rgba(255,248,231,0.76)' },
  { top: 79, left: 39, size: 1.5, durationMs: 3400, delayMs: 1180, phase: 0.42, color: 'rgba(235,231,255,0.76)' },
  { top: 82, left: 87, size: 2, durationMs: 3100, delayMs: 340, phase: 0.64, color: 'rgba(248,245,255,0.78)' },
  { top: 85, left: 24, size: 1, durationMs: 2400, delayMs: 800, phase: 0.36, color: 'rgba(226,221,255,0.72)' },
  { top: 88, left: 53, size: 1.5, durationMs: 3700, delayMs: 1040, phase: 0.48, color: 'rgba(255,238,206,0.74)' },
  { top: 91, left: 11, size: 2, durationMs: 2800, delayMs: 560, phase: 0.7, color: 'rgba(242,239,255,0.72)' },
  { top: 93, left: 77, size: 1, durationMs: 4100, delayMs: 930, phase: 0.26, color: 'rgba(235,231,255,0.7)' },
];

function TwinklingStar({ star, reduceMotion }: { star: NightSkyStar; reduceMotion: boolean }) {
  const [twinkle] = useState(() => new Animated.Value(star.phase));

  useEffect(() => {
    if (reduceMotion) {
      twinkle.setValue(star.phase);
      return;
    }

    const halfDuration = Math.round(star.durationMs / 2);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(star.delayMs),
        Animated.timing(twinkle, {
          toValue: 1,
          duration: halfDuration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(twinkle, {
          toValue: 0,
          duration: halfDuration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [reduceMotion, star.delayMs, star.durationMs, star.phase, twinkle]);

  const opacity = twinkle.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [
      NIGHT_SKY_TWINKLE.minOpacity,
      NIGHT_SKY_TWINKLE.maxOpacity,
      NIGHT_SKY_TWINKLE.minOpacity,
    ],
  });
  const scale = twinkle.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.88, star.glow ? 1.18 : 1.08, 0.88],
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
          shadowColor: star.color,
          shadowOpacity: star.glow ? 0.72 : 0.32,
          shadowRadius: star.glow ? 8 : 3,
          shadowOffset: { width: 0, height: 0 },
          elevation: star.glow ? 3 : 1,
        },
        { opacity, transform: [{ scale }] },
      ]}
    />
  );
}

function CrescentMoon() {
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
      <View
        style={{
          position: 'absolute',
          width: 66,
          height: 66,
          borderRadius: 33,
          backgroundColor: 'rgba(255,223,168,0.1)',
          shadowColor: '#FFE5B9',
          shadowOpacity: 0.22,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      <Svg width={54} height={54} viewBox="0 0 54 54">
        <Circle cx={25} cy={27} r={19} fill="#FFE6B9" />
        <Circle cx={35} cy={21} r={20} fill="#1A1731" />
      </Svg>
    </View>
  );
}

export function OnboardingNightSky({ reduceMotion = false }: { reduceMotion?: boolean }) {
  return (
    <View pointerEvents="none" style={FILL}>
      <LinearGradient
        colors={['#101124', '#17142B', '#211B3D', '#28204A']}
        locations={[0, 0.46, 0.78, 1]}
        start={{ x: 0.18, y: 0 }}
        end={{ x: 0.82, y: 1 }}
        style={FILL}
      />
      <View style={[FILL, { backgroundColor: 'rgba(7,8,22,0.24)' }]} />
      <CrescentMoon />
      {STARS.map((star, index) => (
        <TwinklingStar key={`${star.top}-${star.left}-${index}`} star={star} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

export default OnboardingNightSky;
