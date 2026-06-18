import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import type { AccentState, SurfaceMode } from '@/theme';
import { colors, fonts, getAccentForState, radii, shadows, sky, surfaces } from '@/theme';

export type OrbSky = 'day' | 'night' | 'dusk';
export type OrbCoreKind = 'timer' | 'check';

export type OrbHeroProps = {
  state: AccentState;
  skyTone: OrbSky;
  eyebrow: string;
  timerText: string;
  title: string;
  description: string;
  actionLabel: string;
  progress: number;
  coreKind?: OrbCoreKind;
  onActionPress?: () => void;
  /** surface palette for the caption below the orb (the orb itself is unchanged) */
  surfaceMode?: SurfaceMode;
};

const ORB_SIZE = 178;
const RING_RADIUS = 79;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function clampProgress(progress: number) {
  return Math.max(0, Math.min(1, progress));
}

function StateIcon({ state, color }: { state: AccentState; color: string }) {
  if (state === 'diaper') {
    return (
      <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
        <Path d="M5 13l4 4L19 7" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  if (state === 'feed') {
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

function SkyDecor({ skyTone }: { skyTone: OrbSky }) {
  if (skyTone === 'night') {
    const stars: { top: number; left?: number; right?: number; size: number }[] = [
      { top: 19, left: 30, size: 13 },
      { top: 46, right: 36, size: 9 },
      { top: 82, left: 54, size: 7 },
      { top: 26, right: 72, size: 10 },
    ];

    return (
      <>
        {stars.map((star, index) => (
          <Svg
            key={index}
            width={star.size}
            height={star.size}
            viewBox="0 0 24 24"
            style={{ position: 'absolute', top: star.top, left: star.left, right: star.right }}>
            <Path d="M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7Z" fill="rgba(255,255,255,0.9)" />
          </Svg>
        ))}
      </>
    );
  }

  return (
    <>
      <View
        style={{
          position: 'absolute',
          top: 22,
          left: 22,
          width: 54,
          height: 20,
          borderRadius: 40,
          backgroundColor: 'rgba(255,255,255,0.7)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 27,
          left: 38,
          width: 26,
          height: 12,
          borderRadius: 40,
          backgroundColor: 'rgba(255,255,255,0.55)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 56,
          right: 26,
          width: 38,
          height: 14,
          borderRadius: 40,
          backgroundColor: 'rgba(255,255,255,0.7)',
        }}
      />
    </>
  );
}

export function OrbHero({
  state,
  skyTone,
  eyebrow,
  timerText,
  title,
  description,
  actionLabel,
  progress,
  coreKind = 'timer',
  onActionPress,
  surfaceMode = 'day',
}: OrbHeroProps) {
  const accent = getAccentForState(state);
  const caption = surfaces[surfaceMode];
  const [breathe] = useState(() => new Animated.Value(0));
  const progressValue = clampProgress(progress);
  const strokeDashoffset = useMemo(
    () => RING_CIRCUMFERENCE * (1 - progressValue),
    [progressValue],
  );

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 2750,
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 2750,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [breathe]);

  const scale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1.03],
  });

  return (
    <View style={{ gap: 11 }}>
      <LinearGradient
        colors={sky[skyTone]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: radii.large,
          paddingTop: 18,
          paddingHorizontal: 18,
          paddingBottom: 20,
          ...shadows.card,
        }}>
        <SkyDecor skyTone={skyTone} />

        <View style={{ position: 'relative', zIndex: 2, alignItems: 'center' }}>
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
              <OrbBody skyTone={skyTone} />
            </Animated.View>

            <View style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
              <Svg width={ORB_SIZE} height={ORB_SIZE} viewBox={`0 0 ${ORB_SIZE} ${ORB_SIZE}`}>
                <Circle
                  cx={89}
                  cy={89}
                  r={RING_RADIUS}
                  fill="none"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={10}
                />
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
                <StateIcon state={state} color={accent.color} />
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

          <PrimaryActionButton label={actionLabel} accentColor={accent.color} onPress={onActionPress} />
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 4 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 17, lineHeight: 20, color: caption.ink }}>
          {title}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: caption.inkSoft, marginTop: 2 }}>
          {description}
        </Text>
      </View>
    </View>
  );
}

export default OrbHero;
