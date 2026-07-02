/**
 * VoiceOrb — the signature glass circle inside the night-sky hero.
 *
 * States:
 *  - 'available_idle'    breathing halo, mic, "Tap to talk"
 *  - 'listening'         three staggered pulse rings + live label
 *  - 'unavailable'       no speech service / module absent
 *  - 'permission_denied' mic permission refused
 *  - 'no_match'          speech ran but produced no usable transcript
 *  - 'error'             temporary recognition failure
 *
 * All loops are gated on reduce-motion. The orb itself never routes — it only
 * reports taps; the owner decides whether that means "listen" or "focus the
 * text input" (degradation is a first-class state, never a crash).
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { colors, fonts } from '@/theme';

export type VoiceOrbState =
  | 'available_idle'
  | 'listening'
  | 'unavailable'
  | 'permission_denied'
  | 'no_match'
  | 'error';

const ORB_SIZE = 154;
const RING_COUNT = 3;
const RING_STAGGER_MS = 530;

function MicIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5Z"
        stroke={colors.sleep}
        strokeWidth={2}
      />
      <Path
        d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"
        stroke={colors.sleep}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function MicOffIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5a3 3 0 0 1 5.2-2M15 8.5V11a3 3 0 0 1-.5 1.7M5 11a7 7 0 0 0 9.1 6.7M19 11a7 7 0 0 1-1.2 3.9M12 18v4M8 22h8"
        stroke={colors.sleep}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M4 4l16 16"
        stroke={colors.sleep}
        strokeWidth={2.1}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PulseRing({ delayMs, active }: { delayMs: number; active: boolean }) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(progress, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, delayMs, progress]);

  if (!active) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: ORB_SIZE,
        height: ORB_SIZE,
        borderRadius: ORB_SIZE / 2,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.55)',
        opacity: progress.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.6, 0] }),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
      }}
    />
  );
}

type Props = {
  state: VoiceOrbState;
  reduceMotion: boolean;
  onPress: () => void;
  /** interim transcript shown while listening (optional) */
  interimText?: string | null;
};

export function VoiceOrb({ state, reduceMotion, onPress, interimText }: Props) {
  const [breathe] = useState(() => new Animated.Value(0));
  const degraded =
    state === 'permission_denied' || state === 'unavailable' || state === 'no_match' || state === 'error';

  useEffect(() => {
    if (reduceMotion || degraded) {
      breathe.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, degraded, reduceMotion]);

  const label: Record<VoiceOrbState, string> = {
    available_idle: 'Tap to talk',
    listening: 'Listening...',
    unavailable: 'Voice unavailable',
    permission_denied: 'Enable microphone',
    no_match: "Didn't catch that",
    error: 'Try again',
  };

  const accessibilityLabel = (() => {
    switch (state) {
      case 'unavailable':
        return 'Voice unavailable in this build. Tap to type your question instead.';
      case 'permission_denied':
        return 'Enable microphone. Open settings or type your question instead.';
      case 'no_match':
        return "Didn't catch that. Tap to try speaking again.";
      case 'error':
        return "Voice didn't catch that. Tap to try again.";
      case 'listening':
        return 'Listening. Tap to stop.';
      case 'available_idle':
        return 'Tap to talk';
    }
  })();

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => ({
          width: ORB_SIZE,
          height: ORB_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.96 : 1 }],
        })}>
        {/* breathing halo */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: ORB_SIZE + 12,
            height: ORB_SIZE + 12,
            transform: [
              { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.04] }) },
            ],
          }}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id="orbHalo" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#BEC4FF" stopOpacity={0.45} />
                <Stop offset="70%" stopColor="#BEC4FF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={50} cy={50} r={50} fill="url(#orbHalo)" />
          </Svg>
        </Animated.View>

        {/* pulse rings while listening */}
        {Array.from({ length: RING_COUNT }, (_, ix) => (
          <PulseRing
            key={ix}
            delayMs={ix * RING_STAGGER_MS}
            active={state === 'listening' && !reduceMotion}
          />
        ))}

        {/* glass disc */}
        <View
          style={{
            width: ORB_SIZE,
            height: ORB_SIZE,
            borderRadius: ORB_SIZE / 2,
            backgroundColor: 'rgba(255,255,255,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            shadowColor: 'rgb(20,15,40)',
            shadowOpacity: 0.65,
            shadowRadius: 17,
            shadowOffset: { width: 0, height: 10 },
            elevation: 10,
          }}>
          {degraded ? <MicOffIcon /> : <MicIcon />}
          <Text
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={{
              width: ORB_SIZE - 34,
              fontFamily: fonts.bodyBold,
              fontSize: 11,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
              textAlign: 'center',
              color: colors.sleep,
            }}>
            {label[state]}
          </Text>
        </View>
      </Pressable>

      {state === 'listening' && interimText ? (
        <Text
          numberOfLines={2}
          style={{
            marginTop: 12,
            paddingHorizontal: 18,
            textAlign: 'center',
            fontFamily: fonts.body,
            fontSize: 13,
            lineHeight: 19,
            color: 'rgba(255,255,255,0.92)',
          }}>
          “{interimText}”
        </Text>
      ) : null}
    </View>
  );
}
