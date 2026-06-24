import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, fonts, radii, shadows, sky } from '@/theme';

import { ONBOARDING_PANELS, type OnboardingPanel, type OnboardingVisual } from './onboardingContent';

const logoGlow = require('../../../assets/images/logo-glow.png');

const INTRO_MS = 1550;
const INTRO_MS_REDUCED = 450;
const BUTTON_HEIGHT = 54;
const FILL = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

type Props = {
  onComplete: () => Promise<void> | void;
};

type QuickTile = {
  label: string;
  color: string;
  tint: string;
  kind: 'feed' | 'sleep' | 'diaper' | 'pump';
};

const QUICK_TILES: QuickTile[] = [
  { label: 'Feed', color: colors.feed, tint: colors.feedTint, kind: 'feed' },
  { label: 'Sleep', color: colors.sleep, tint: colors.sleepTint, kind: 'sleep' },
  { label: 'Diaper', color: colors.diaper, tint: colors.diaperTint, kind: 'diaper' },
  { label: 'Pump', color: colors.pump, tint: colors.pumpTint, kind: 'pump' },
];

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

function OnboardingIntro({ onDone, reduceMotion }: { onDone: () => void; reduceMotion: boolean }) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.92));
  const [breathe] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const entrance = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: reduceMotion ? 120 : 420,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 42,
        useNativeDriver: true,
      }),
    ]);

    entrance.start();

    const loop = reduceMotion
      ? null
      : Animated.loop(
          Animated.sequence([
            Animated.timing(breathe, { toValue: 1, duration: 1350, useNativeDriver: true }),
            Animated.timing(breathe, { toValue: 0, duration: 1350, useNativeDriver: true }),
          ]),
        );
    loop?.start();

    const timer = setTimeout(onDone, reduceMotion ? INTRO_MS_REDUCED : INTRO_MS);

    return () => {
      entrance.stop();
      loop?.stop();
      clearTimeout(timer);
    };
  }, [breathe, onDone, opacity, reduceMotion, scale]);

  const breatheScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.045],
  });

  return (
    <View
      accessibilityLabel="Lullaby. A calm night log for the half-asleep hours."
      style={{
        flex: 1,
        backgroundColor: colors.cream,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
      }}>
      <Animated.Image
        source={logoGlow}
        resizeMode="contain"
        style={{
          width: 156,
          height: 156,
          opacity,
          transform: [{ scale }, { scale: reduceMotion ? 1 : breatheScale }],
        }}
      />
      <Animated.View style={{ opacity, alignItems: 'center', marginTop: 12 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 31, color: colors.ink }}>Lullaby</Text>
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 15,
            lineHeight: 22,
            color: colors.inkSoft,
            textAlign: 'center',
            marginTop: 6,
            maxWidth: 260,
          }}>
          A calm night log for the half-asleep hours.
        </Text>
      </Animated.View>
    </View>
  );
}

function MiniIcon({ kind, color }: { kind: QuickTile['kind']; color: string }) {
  if (kind === 'feed') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M9 2h6M10 2v3.5a4 4 0 0 0-1.2 2.8L8 19a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3l-.8-10.7A4 4 0 0 0 14 5.5V2"
          stroke={color}
          strokeWidth={1.9}
          strokeLinejoin="round"
        />
        <Path d="M8.4 12h7.2" stroke={color} strokeWidth={1.9} />
      </Svg>
    );
  }

  if (kind === 'sleep') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
          stroke={color}
          strokeWidth={1.9}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (kind === 'diaper') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M3 7h18l-1.5 4.5A8 8 0 0 1 12 17a8 8 0 0 1-7.5-5.5L3 7Z"
          stroke={color}
          strokeWidth={1.9}
          strokeLinejoin="round"
        />
        <Path d="M9 11c1 1.2 5 1.2 6 0" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      </Svg>
    );
  }

  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 21h10M8 21V11h8v10M6 11h12M9 11V7a3 3 0 0 1 6 0v4"
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Star({ top, left, size }: { top: number; left: number; size: number }) {
  return (
    <View style={{ position: 'absolute', top, left, opacity: 0.85 }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7Z" fill="rgba(255,255,255,0.9)" />
      </Svg>
    </View>
  );
}

function NightVisual() {
  return (
    <View
      style={{
        height: 246,
        borderRadius: radii.large,
        overflow: 'hidden',
        ...shadows.card,
      }}>
      <LinearGradient colors={sky.night} start={{ x: 0.08, y: 0 }} end={{ x: 0.92, y: 1 }} style={FILL} />
      <Star top={25} left={34} size={13} />
      <Star top={62} left={252} size={9} />
      <Star top={92} left={64} size={7} />
      <Star top={32} left={202} size={10} />
      <View
        style={{
          position: 'absolute',
          top: 22,
          left: 24,
          width: 58,
          height: 20,
          borderRadius: 40,
          backgroundColor: 'rgba(255,255,255,0.18)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 38,
          right: 26,
          width: 44,
          height: 16,
          borderRadius: 40,
          backgroundColor: 'rgba(255,255,255,0.15)',
        }}
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 12 }}>
        <View
          style={{
            width: 126,
            height: 126,
            borderRadius: 63,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.18)',
            shadowColor: '#9696F0',
            shadowOpacity: 0.55,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 0 },
          }}>
          <View
            style={{
              width: 92,
              height: 92,
              borderRadius: 46,
              backgroundColor: 'rgba(255,255,255,0.82)',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.55)',
            }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 9, color: colors.sleep, letterSpacing: 1 }}>
              ASLEEP
            </Text>
            <Text style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 33, color: colors.ink }}>
              1h
            </Text>
          </View>
        </View>
      </View>
      <View
        style={{
          marginHorizontal: 18,
          marginBottom: 16,
          borderRadius: radii.medium,
          backgroundColor: 'rgba(255,255,255,0.18)',
          padding: 12,
        }}>
        <Text style={{ fontFamily: fonts.bodyBold, color: colors.white, fontSize: 12 }}>Now · Sleep running</Text>
        <Text style={{ fontFamily: fonts.body, color: 'rgba(255,255,255,0.72)', fontSize: 11, marginTop: 2 }}>
          3:10 · Feed saved
        </Text>
      </View>
    </View>
  );
}

function QuickLogVisual() {
  return (
    <View style={{ height: 246, justifyContent: 'center', gap: 10 }}>
      {[0, 2].map((start) => (
        <View key={start} style={{ flexDirection: 'row', gap: 10 }}>
          {QUICK_TILES.slice(start, start + 2).map((tile) => (
            <View
              key={tile.kind}
              style={{
                flex: 1,
                minHeight: 94,
                borderRadius: radii.medium,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: 'rgba(60,40,30,0.1)',
                padding: 13,
                ...shadows.card,
              }}>
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 16,
                  backgroundColor: tile.tint,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <MiniIcon kind={tile.kind} color={tile.color} />
              </View>
              <Text style={{ fontFamily: fonts.displayMedium, fontSize: 16, color: tile.color, marginTop: 9 }}>
                {tile.label}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function RecapVisual() {
  return (
    <View style={{ height: 246, justifyContent: 'center' }}>
      <View
        style={{
          borderRadius: radii.large,
          backgroundColor: colors.surface,
          padding: 18,
          borderWidth: 1,
          borderColor: colors.line,
          ...shadows.card,
        }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.1, color: colors.sleep }}>
          MORNING RECAP
        </Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 25, lineHeight: 31, color: colors.ink, marginTop: 6 }}>
          You have the thread.
        </Text>
        <View style={{ marginTop: 16, gap: 10 }}>
          <RecapRow color={colors.feed} label="Last feed" value="4:12 AM" />
          <RecapRow color={colors.diaper} label="Diapers" value="2 saved" />
          <RecapRow color={colors.sleep} label="Sleep" value="5h 20m total" />
        </View>
        <View
          style={{
            alignSelf: 'flex-start',
            marginTop: 16,
            borderRadius: radii.pill,
            backgroundColor: colors.sleepTint,
            paddingHorizontal: 12,
            paddingVertical: 7,
          }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.sleep }}>Reassure is close by</Text>
        </View>
      </View>
    </View>
  );
}

function RecapRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <CircleDot color={color} />
      <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 13, color: colors.inkSoft, marginLeft: 9 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink }}>{value}</Text>
    </View>
  );
}

function CircleDot({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12">
      <Circle cx={6} cy={6} r={5} fill={color} opacity={0.18} />
      <Circle cx={6} cy={6} r={2.5} fill={color} />
    </Svg>
  );
}

function PanelVisual({ visual }: { visual: OnboardingVisual }) {
  if (visual === 'night') return <NightVisual />;
  if (visual === 'quick-log') return <QuickLogVisual />;
  return <RecapVisual />;
}

function OnboardingPanelView({ panel, width }: { panel: OnboardingPanel; width: number }) {
  return (
    <View style={{ width, paddingHorizontal: 22, justifyContent: 'center' }}>
      <PanelVisual visual={panel.visual} />
      <View style={{ marginTop: 26 }}>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 11,
            letterSpacing: 1.3,
            textTransform: 'uppercase',
            color: colors.sleep,
          }}>
          {panel.eyebrow}
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: 31,
            lineHeight: 37,
            color: colors.ink,
            marginTop: 7,
          }}>
          {panel.title}
        </Text>
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 15,
            lineHeight: 22,
            color: colors.inkSoft,
            marginTop: 8,
          }}>
          {panel.body}
        </Text>
      </View>
    </View>
  );
}

function PageDots({ index }: { index: number }) {
  return (
    <View accessibilityLabel={`Onboarding page ${index + 1} of ${ONBOARDING_PANELS.length}`} style={{ flexDirection: 'row', gap: 7 }}>
      {ONBOARDING_PANELS.map((panel, dotIndex) => {
        const active = dotIndex === index;
        return (
          <View
            key={panel.id}
            style={{
              width: active ? 22 : 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: active ? colors.sleep : colors.line,
            }}
          />
        );
      })}
    </View>
  );
}

export function OnboardingScreen({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [showIntro, setShowIntro] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [completing, setCompleting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [pageOpacity] = useState(() => new Animated.Value(0));
  const panelWidth = Math.max(width, 320);
  const isLast = activeIndex === ONBOARDING_PANELS.length - 1;

  const revealPanels = useCallback(() => {
    setShowIntro(false);
    Animated.timing(pageOpacity, {
      toValue: 1,
      duration: reduceMotion ? 120 : 260,
      useNativeDriver: true,
    }).start();
  }, [pageOpacity, reduceMotion]);

  useEffect(() => {
    if (!showIntro) {
      scrollRef.current?.scrollTo({ x: activeIndex * panelWidth, animated: false });
    }
  }, [activeIndex, panelWidth, showIntro]);

  const complete = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    try {
      await onComplete();
    } finally {
      setCompleting(false);
    }
  }, [completing, onComplete]);

  const next = useCallback(() => {
    if (isLast) {
      void complete();
      return;
    }
    const nextIndex = activeIndex + 1;
    setActiveIndex(nextIndex);
    scrollRef.current?.scrollTo({ x: nextIndex * panelWidth, animated: true });
  }, [activeIndex, complete, isLast, panelWidth]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / panelWidth);
      if (nextIndex >= 0 && nextIndex < ONBOARDING_PANELS.length && nextIndex !== activeIndex) {
        setActiveIndex(nextIndex);
      }
    },
    [activeIndex, panelWidth],
  );

  if (showIntro) {
    return <OnboardingIntro onDone={revealPanels} reduceMotion={reduceMotion} />;
  }

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: pageOpacity,
        backgroundColor: colors.cream,
        paddingTop: insets.top + 14,
        paddingBottom: insets.bottom + 18,
      }}>
      <View
        style={{
          minHeight: 36,
          paddingHorizontal: 22,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink }}>Lullaby</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          onPress={() => void complete()}
          hitSlop={8}
          disabled={completing}
          style={({ pressed }) => ({ opacity: pressed ? 0.55 : completing ? 0.45 : 1 })}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.sleep }}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center' }}>
        {ONBOARDING_PANELS.map((panel) => (
          <OnboardingPanelView key={panel.id} panel={panel} width={panelWidth} />
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 22, gap: 16 }}>
        <View style={{ alignItems: 'center' }}>
          <PageDots index={activeIndex} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Set up baby' : 'Next onboarding screen'}
          accessibilityState={{ busy: completing, disabled: completing }}
          onPress={next}
          disabled={completing}
          style={({ pressed }) => ({
            borderRadius: radii.pill,
            transform: [{ scale: pressed && !completing ? 0.98 : 1 }],
          })}>
          <View
            style={{
              minHeight: BUTTON_HEIGHT,
              borderRadius: radii.pill,
              backgroundColor: colors.sleep,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: completing ? 0.62 : 1,
              ...shadows.card,
            }}>
            {completing ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.white }}>
                {isLast ? 'Set up baby' : 'Next'}
              </Text>
            )}
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export default OnboardingScreen;
