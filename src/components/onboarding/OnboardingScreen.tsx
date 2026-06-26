import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
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

import {
  ONBOARDING_PANELS,
  getNextOnboardingStep,
  getOnboardingPrimaryActionState,
  getOnboardingIntroDuration,
  isFinalOnboardingPanel,
  shouldShowOnboardingSkip,
  type OnboardingPanel,
  type OnboardingVisual,
} from './onboardingContent';

const logoGlow = require('../../../assets/images/logo-glow.png');

const BUTTON_HEIGHT = 54;
const PANEL_ENTER_MS = 360;
const PANEL_STAGGER_MS = 72;
const CONTROLS_ENTER_MS = 260;
const ADVANCE_SETTLE_FALLBACK_MS = 460;
const FILL = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

type Props = {
  onComplete: () => Promise<void> | void;
};

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

    const timer = setTimeout(onDone, getOnboardingIntroDuration(reduceMotion));

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
      accessibilityLabel="Lullaby. A simple night log for feeds, sleep, and diapers."
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
          A simple night log for feeds, sleep, and diapers.
        </Text>
      </Animated.View>
    </View>
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
        <Text style={{ fontFamily: fonts.bodyBold, color: colors.white, fontSize: 12 }}>Now · Baby asleep</Text>
        <Text style={{ fontFamily: fonts.body, color: 'rgba(255,255,255,0.72)', fontSize: 11, marginTop: 2 }}>
          3:10 · Feed · 11 min · L
        </Text>
      </View>
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
          WHAT HAPPENED
        </Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 25, lineHeight: 31, color: colors.ink, marginTop: 6 }}>
          What happened last night
        </Text>
        <View style={{ marginTop: 16, gap: 10 }}>
          <RecapRow color={colors.feed} label="Feeds" value="2 overnight" />
          <RecapRow color={colors.diaper} label="Diaper" value="Wet · 3:30" />
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
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.sleep }}>Ready for the morning</Text>
        </View>
      </View>
    </View>
  );
}

function ReassureVisual() {
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
        <View
          style={{
            alignSelf: 'flex-start',
            borderRadius: radii.pill,
            backgroundColor: colors.sleepTint,
            paddingHorizontal: 12,
            paddingVertical: 7,
          }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.05, color: colors.sleep }}>
            ASK
          </Text>
        </View>

        <View style={{ marginTop: 16, gap: 10 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              maxWidth: '82%',
              borderRadius: 18,
              backgroundColor: colors.surfaceSoft,
              paddingHorizontal: 13,
              paddingVertical: 11,
            }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18, color: colors.ink }}>
              What should I try next?
            </Text>
          </View>
          <View
            style={{
              alignSelf: 'flex-end',
              maxWidth: '88%',
              borderRadius: 20,
              backgroundColor: colors.feedTint,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderWidth: 1,
              borderColor: 'rgba(255,122,61,0.16)',
            }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 19, color: colors.ink }}>
              Check feed, diaper, and temperature. Then pause.
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <CircleDot color={colors.sleep} />
          <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.inkSoft }}>
            Calm next step, not a diagnosis.
          </Text>
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

function usePanelEntry(animateEntry: boolean, reduceMotion: boolean) {
  const initialValue = animateEntry && !reduceMotion ? 0 : 1;
  const [visual] = useState(() => new Animated.Value(initialValue));
  const [eyebrow] = useState(() => new Animated.Value(initialValue));
  const [title] = useState(() => new Animated.Value(initialValue));
  const [body] = useState(() => new Animated.Value(initialValue));

  useEffect(() => {
    const values = [visual, eyebrow, title, body];
    values.forEach((value) => value.stopAnimation());

    if (!animateEntry) {
      values.forEach((value) => value.setValue(1));
      return;
    }

    if (reduceMotion) {
      values.forEach((value) => value.setValue(1));
      return;
    }

    values.forEach((value) => value.setValue(0));
    Animated.stagger(
      PANEL_STAGGER_MS,
      values.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: PANEL_ENTER_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [animateEntry, body, eyebrow, reduceMotion, title, visual]);

  return { visual, eyebrow, title, body };
}

function entryStyle(value: Animated.Value, reduceMotion: boolean, translateY = 12, scaleFrom = 1) {
  return {
    opacity: value,
    transform: [
      {
        translateY: reduceMotion
          ? 0
          : value.interpolate({
              inputRange: [0, 1],
              outputRange: [translateY, 0],
            }),
      },
      {
        scale: reduceMotion
          ? 1
          : value.interpolate({
              inputRange: [0, 1],
              outputRange: [scaleFrom, 1],
            }),
      },
    ],
  };
}

function PanelVisual({ visual }: { visual: OnboardingVisual }) {
  if (visual === 'night') return <NightVisual />;
  if (visual === 'reassure') return <ReassureVisual />;
  return <RecapVisual />;
}

function OnboardingPanelView({
  panel,
  width,
  animateEntry,
  reduceMotion,
}: {
  panel: OnboardingPanel;
  width: number;
  animateEntry: boolean;
  reduceMotion: boolean;
}) {
  const entry = usePanelEntry(animateEntry, reduceMotion);

  return (
    <View style={{ width, paddingHorizontal: 22, justifyContent: 'center' }}>
      <Animated.View style={entryStyle(entry.visual, reduceMotion, 16, 0.985)}>
        <PanelVisual visual={panel.visual} />
      </Animated.View>
      <View style={{ marginTop: 26 }}>
        <Animated.Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 11,
            letterSpacing: 1.3,
            textTransform: 'uppercase',
            color: colors.sleep,
            ...entryStyle(entry.eyebrow, reduceMotion, 10),
          }}>
          {panel.eyebrow}
        </Animated.Text>
        <Animated.Text
          style={{
            fontFamily: fonts.display,
            fontSize: 31,
            lineHeight: 37,
            color: colors.ink,
            marginTop: 7,
            ...entryStyle(entry.title, reduceMotion, 12, 0.992),
          }}>
          {panel.title}
        </Animated.Text>
        <Animated.Text
          style={{
            fontFamily: fonts.body,
            fontSize: 15,
            lineHeight: 22,
            color: colors.inkSoft,
            marginTop: 8,
            ...entryStyle(entry.body, reduceMotion, 12),
          }}>
          {panel.body}
        </Animated.Text>
      </View>
    </View>
  );
}

function PageDot({ active, reduceMotion }: { active: boolean; reduceMotion: boolean }) {
  const [progress] = useState(() => new Animated.Value(active ? 1 : 0));

  useEffect(() => {
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: reduceMotion ? 1 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active, progress, reduceMotion]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: [7, 22] });
  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.line, colors.sleep],
  });

  return <Animated.View style={{ width, height: 7, borderRadius: 4, backgroundColor }} />;
}

function PageDots({ index, reduceMotion }: { index: number; reduceMotion: boolean }) {
  return (
    <View
      accessibilityLabel={`Onboarding page ${index + 1} of ${ONBOARDING_PANELS.length}`}
      style={{ flexDirection: 'row', gap: 7 }}>
      {ONBOARDING_PANELS.map((panel, dotIndex) => {
        const active = dotIndex === index;
        return <PageDot key={panel.id} active={active} reduceMotion={reduceMotion} />;
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
  const [advanceInFlight, setAdvanceInFlight] = useState(false);
  const [completing, setCompleting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const pendingIndexRef = useRef<number | null>(null);
  const settleFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pageOpacity] = useState(() => new Animated.Value(0));
  const [controlsEntry] = useState(() => new Animated.Value(0));
  const panelWidth = Math.max(width, 320);
  const isLast = isFinalOnboardingPanel(activeIndex);
  const primaryAction = getOnboardingPrimaryActionState(activeIndex, completing);
  const showSkip = shouldShowOnboardingSkip(activeIndex);

  const clearSettleFallback = useCallback(() => {
    if (settleFallbackRef.current) {
      clearTimeout(settleFallbackRef.current);
      settleFallbackRef.current = null;
    }
  }, []);

  const revealPanels = useCallback(() => {
    setShowIntro(false);
    Animated.timing(pageOpacity, {
      toValue: 1,
      duration: reduceMotion ? 80 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pageOpacity, reduceMotion]);

  const settlePage = useCallback(
    (index: number) => {
      if (index < 0 || index >= ONBOARDING_PANELS.length) return;
      clearSettleFallback();
      pendingIndexRef.current = null;
      setAdvanceInFlight(false);
      setActiveIndex(index);
    },
    [clearSettleFallback],
  );

  useEffect(() => {
    if (!showIntro) {
      scrollRef.current?.scrollTo({ x: activeIndex * panelWidth, animated: false });
    }
  }, [activeIndex, panelWidth, showIntro]);

  useEffect(() => clearSettleFallback, [clearSettleFallback]);

  useEffect(() => {
    if (showIntro) return;

    controlsEntry.stopAnimation();
    if (reduceMotion) {
      controlsEntry.setValue(1);
      return;
    }

    controlsEntry.setValue(0);
    Animated.timing(controlsEntry, {
      toValue: 1,
      duration: CONTROLS_ENTER_MS,
      delay: PANEL_STAGGER_MS * 4,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [controlsEntry, reduceMotion, showIntro]);

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
    if (advanceInFlight) return;
    const step = getNextOnboardingStep(activeIndex);
    if (step === 'complete') {
      void complete();
      return;
    }

    if (reduceMotion) {
      clearSettleFallback();
      pendingIndexRef.current = null;
      setAdvanceInFlight(false);
      setActiveIndex(step);
      scrollRef.current?.scrollTo({ x: step * panelWidth, animated: false });
      return;
    }

    pendingIndexRef.current = step;
    setAdvanceInFlight(true);
    scrollRef.current?.scrollTo({ x: step * panelWidth, animated: !reduceMotion });
    clearSettleFallback();
    settleFallbackRef.current = setTimeout(() => settlePage(step), ADVANCE_SETTLE_FALLBACK_MS);
  }, [activeIndex, advanceInFlight, clearSettleFallback, complete, panelWidth, reduceMotion, settlePage]);

  const handleScrollSettled = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / panelWidth);
      settlePage(nextIndex);
    },
    [panelWidth, settlePage],
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
        {showSkip ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            onPress={() => void complete()}
            hitSlop={8}
            disabled={completing}
            style={({ pressed }) => ({ opacity: pressed ? 0.55 : completing ? 0.45 : 1 })}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.sleep }}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollSettled}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center' }}>
        {ONBOARDING_PANELS.map((panel, panelIndex) => (
          <OnboardingPanelView
            key={panel.id}
            panel={panel}
            width={panelWidth}
            animateEntry={panelIndex === 0}
            reduceMotion={reduceMotion}
          />
        ))}
      </ScrollView>

      <Animated.View
        style={{
          paddingHorizontal: 22,
          gap: 16,
          opacity: controlsEntry,
          transform: [
            {
              translateY: reduceMotion
                ? 0
                : controlsEntry.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
            },
          ],
        }}>
        <View style={{ alignItems: 'center' }}>
          <PageDots index={activeIndex} reduceMotion={reduceMotion} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Set up baby' : 'Next onboarding screen'}
          accessibilityState={{ busy: primaryAction.loading, disabled: completing || advanceInFlight }}
          onPress={next}
          disabled={completing || advanceInFlight}
          style={({ pressed }) => ({
            borderRadius: radii.pill,
            transform: [{ scale: pressed && !completing && !advanceInFlight ? 0.985 : 1 }],
          })}>
          {({ pressed }) => (
            <View
              style={{
                minHeight: BUTTON_HEIGHT,
                borderRadius: radii.pill,
                backgroundColor: pressed && !completing && !advanceInFlight ? colors.sleep2 : colors.sleep,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: primaryAction.loading ? 0.86 : 1,
                ...shadows.card,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                {primaryAction.loading ? <ActivityIndicator size="small" color={colors.white} /> : null}
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.white }}>
                  {primaryAction.label}
                </Text>
              </View>
            </View>
          )}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

export default OnboardingScreen;
