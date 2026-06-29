/**
 * <Orb> — the shared, breathing orb extracted from `OrbHero` (onboarding Phase
 * 1A foundation, roadmap §13).
 *
 * This is just the orb itself: the day/night body cross-fade, the progress ring,
 * and the white core (eyebrow + timer/check). It owns one breathe driver — pass a
 * shared `useOrbBreathe()` value when two copies must stay in phase (e.g. a
 * theme-reveal overlay), or omit it for a standalone orb that runs its own loop.
 *
 * `OrbHero` composes this inside its sky card; the onboarding flow (next slice)
 * renders the same `<Orb>` as its header protagonist, so the orb is one object
 * that follows the parent from setup home to Tonight. The surrounding sky card,
 * cloud/star decor, description pill, and primary button stay in `OrbHero`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import type { AccentState } from '@/theme';
import { colors, fonts, getAccentForState } from '@/theme';

export type OrbSky = 'day' | 'night' | 'dusk';
export type OrbCoreKind = 'timer' | 'check';
export type OrbStateIconKind = 'clock' | 'moon' | 'feed' | 'check';

const BREATHE_HALF_MS = 2750;

function startBreatheLoop(value: Animated.Value) {
  const animation = Animated.loop(
    Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: BREATHE_HALF_MS, useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: BREATHE_HALF_MS, useNativeDriver: true }),
    ]),
  );
  animation.start();
  return animation;
}

/** A self-running breathe value to share across orb copies (e.g. a reveal overlay). */
export function useOrbBreathe() {
  const [breathe] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = startBreatheLoop(breathe);
    return () => animation.stop();
  }, [breathe]);
  return breathe;
}

const ORB_SIZE = 178;
const RING_RADIUS = 79;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function clampProgress(progress: number) {
  return Math.max(0, Math.min(1, progress));
}

function StateIcon({
  state,
  color,
  iconKind,
}: {
  state: AccentState;
  color: string;
  iconKind?: OrbStateIconKind;
}) {
  if (iconKind === 'clock') {
    return (
      <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2.4} />
        <Path d="M12 7v5l3 2" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    );
  }

  if (state === 'diaper' || iconKind === 'check') {
    return (
      <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
        <Path d="M5 13l4 4L19 7" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  if (state === 'feed' || iconKind === 'feed') {
    return (
      <Svg width={9} height={9} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={6} fill={color} />
      </Svg>
    );
  }

  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
        stroke={color}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckMark() {
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.diaperTint,
        marginBottom: 2,
      }}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path d="M5 13l4 4L19 7" stroke={colors.diaper} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function OrbBody({ skyTone }: { skyTone: OrbSky }) {
  if (skyTone === 'night') {
    return (
      <Svg width={126} height={126} viewBox="0 0 178 178" fill="none">
        <Defs>
          <RadialGradient id="moonGlow" cx="38%" cy="38%" r="68%">
            <Stop offset="0%" stopColor="#EEF0FF" />
            <Stop offset="55%" stopColor="#C9CEFF" />
            <Stop offset="100%" stopColor="#A6ABF2" />
          </RadialGradient>
        </Defs>
        <Path d="M89 14a74 74 0 1 0 68 102 58 58 0 0 1-68-102Z" fill="url(#moonGlow)" />
      </Svg>
    );
  }

  const gradientId = skyTone === 'dusk' ? 'duskOrb' : 'dayOrb';
  const stops =
    skyTone === 'dusk'
      ? [
          ['0%', '#FFFFFF'],
          ['50%', '#E7E9FC'],
          ['100%', '#CFD4F2'],
        ]
      : [
          ['0%', '#FFF1D6'],
          ['46%', '#FFC15E'],
          ['100%', '#FF9A3D'],
        ];

  return (
    <Svg width={126} height={126} viewBox="0 0 126 126" fill="none">
      <Defs>
        <RadialGradient id={gradientId} cx="44%" cy="42%" r="64%">
          {stops.map(([offset, stopColor]) => (
            <Stop key={offset} offset={offset} stopColor={stopColor} />
          ))}
        </RadialGradient>
      </Defs>
      <Circle cx={63} cy={63} r={63} fill={`url(#${gradientId})`} />
    </Svg>
  );
}

export type OrbProps = {
  state: AccentState;
  skyTone: OrbSky;
  eyebrow: string;
  timerText: string;
  progress: number;
  coreKind?: OrbCoreKind;
  stateIcon?: OrbStateIconKind;
  /**
   * Optional shared breathe driver. Pass the value from `useOrbBreathe()` so a
   * second (theme-reveal overlay) copy of the orb breathes in perfect phase with
   * the base — otherwise each copy runs its own loop and the orb edge appears to
   * jump where the reveal circle crosses it. Omit it for a standalone orb.
   */
  breathe?: Animated.Value;
};

/** The breathing orb body + progress ring + white core. */
export function Orb({
  state,
  skyTone,
  eyebrow,
  timerText,
  progress,
  coreKind = 'timer',
  stateIcon,
  breathe: externalBreathe,
}: OrbProps) {
  const accent = getAccentForState(state);
  // Use the shared breathe driver when given (so a reveal-overlay copy stays in
  // phase); otherwise run our own loop.
  const [internalBreathe] = useState(() => new Animated.Value(0));
  const breathe = externalBreathe ?? internalBreathe;
  const progressValue = clampProgress(progress);
  const strokeDashoffset = useMemo(
    () => RING_CIRCUMFERENCE * (1 - progressValue),
    [progressValue],
  );

  useEffect(() => {
    if (externalBreathe) return; // an external owner drives the loop
    const animation = startBreatheLoop(internalBreathe);
    return () => animation.stop();
  }, [externalBreathe, internalBreathe]);

  const scale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1.03],
  });
  const nightOpacity = skyTone === 'night' ? 1 : 0;
  const dayOpacity = 1 - nightOpacity;
  const dayOrbTone = skyTone === 'dusk' ? 'dusk' : 'day';

  return (
    <View
      style={{
        width: ORB_SIZE,
        height: ORB_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
      }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 126,
          height: 126,
          borderRadius: 63,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: skyTone === 'night' ? '#9696F0' : '#FFA850',
          shadowOpacity: 0.55,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 0 },
          transform: [{ scale }],
        }}>
        <Animated.View style={{ position: 'absolute', opacity: dayOpacity }}>
          <OrbBody skyTone={dayOrbTone} />
        </Animated.View>
        <Animated.View style={{ position: 'absolute', opacity: nightOpacity }}>
          <OrbBody skyTone="night" />
        </Animated.View>
      </Animated.View>

      <View style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Svg width={ORB_SIZE} height={ORB_SIZE} viewBox={`0 0 ${ORB_SIZE} ${ORB_SIZE}`}>
          <Circle cx={89} cy={89} r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={10} />
          <Circle
            cx={89}
            cy={89}
            r={RING_RADIUS}
            fill="none"
            stroke={colors.white}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={strokeDashoffset}
          />
        </Svg>
      </View>

      <View
        style={{
          position: 'relative',
          zIndex: 3,
          width: 128,
          height: 128,
          borderRadius: 64,
          backgroundColor: 'rgba(255,255,255,0.82)',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          shadowColor: 'rgb(60,40,30)',
          shadowOpacity: 0.32,
          shadowRadius: 13,
          shadowOffset: { width: 0, height: 10 },
          elevation: 8,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.74)',
        }}>
        {coreKind === 'check' ? <CheckMark /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <StateIcon state={state} color={accent.color} iconKind={stateIcon} />
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: accent.color,
            }}>
            {eyebrow}
          </Text>
        </View>
        {coreKind === 'timer' ? (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={{
              fontFamily: fonts.display,
              fontSize: 38,
              lineHeight: 42,
              color: colors.ink,
              textAlign: 'center',
            }}>
            {timerText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default Orb;
