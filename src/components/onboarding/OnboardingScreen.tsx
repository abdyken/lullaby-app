/**
 * OnboardingScreen — the live, personalized first-run setup flow (onboarding
 * Phase 1A, roadmap §7/§10/§11/§12).
 *
 * Replaces the old 3-panel value carousel: one warm emotional beat → a few
 * lightweight setup questions → a real handoff into Tonight. The shared `<Orb>`
 * is the protagonist: it stays put across steps (one instance, so it keeps
 * breathing and "follows the parent home"), its sky tone tracks the chosen age,
 * and the baby's name settles into its core.
 *
 * Driven by `useOnboardingFlow` (step STATE, never a scroll index — recorded
 * blank-frame postmortem). Completion writes a real local baby via
 * `useAuth().createLocalBaby` with the §11 ordering (write baby → clear the seed
 * night → mark complete → reveal), so the seed "Mia" never reaches Tonight. The
 * fake "Setting up..." button label is gone — the `creating` step is a true
 * transition.
 *
 * Warm/light first run: the onboarding beat always uses the warm day surface +
 * day orb, so the very first impression is calm and welcoming rather than the
 * low-glare navy night scaffold. (The rest of the app still resolves day/night
 * normally; this override is scoped to the first-run flow only.)
 */
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OrbSky } from '@/components/Orb';
import { AuthButton } from '@/components/auth/AuthShell';
import { birthDateFromWeeks, type CreateLocalBabyInput } from '@/data/localBaby';
import { authWarn } from '@/lib/authLogger';
import { useAuth } from '@/state/AuthProvider';
import {
  colors,
  fonts,
  radii,
  surfaces,
  type SurfaceMode,
  type SurfacePalette,
} from '@/theme';

import { OnboardingFamilyMoment } from './OnboardingFamilyMoment';
import { OnboardingNightSky } from './OnboardingNightSky';
import { OnboardingStepLayout } from './OnboardingStepLayout';
import {
  ONBOARDING_FOCUS_NEEDS,
  toggleOnboardingFocusNeed,
  type OnboardingFocusNeed,
} from './onboardingFocus';
import {
  ONBOARDING_NIGHT_SHIFT_CHOICES,
  hasOnboardingNightShiftChoice,
  type OnboardingNightShiftChoice,
} from './onboardingNightShift';
import { saveOnboardingDraft } from './onboardingStorage';
import { useOnboardingFlow } from './useOnboardingFlow';

type Props = {
  onComplete: () => Promise<void> | void;
};

/**
 * Coarse, one-thumb age control (roadmap §7C): three buckets → a representative
 * number of weeks → `birthDate`, plus the orb sky each maps to (newborn → night,
 * a few weeks → dusk, a few months → day). No keyboard on the critical path.
 */
type AgeChoice = { key: string; label: string; hint: string; weeks: number; sky: OrbSky };
const AGE_CHOICES: AgeChoice[] = [
  { key: 'newborn', label: 'Newborn', hint: 'The first weeks', weeks: 1, sky: 'night' },
  { key: 'weeks', label: 'A few weeks', hint: 'One to two months', weeks: 6, sky: 'dusk' },
  { key: 'months', label: 'A few months', hint: 'Three months and up', weeks: 14, sky: 'day' },
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

/** Small uppercase field label, tinted for the resolved surface. */
function FieldLabel({ surface, text }: { surface: SurfacePalette; text: string }) {
  return (
    <Text
      style={{
        fontFamily: fonts.bodyBold,
        fontSize: 10,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: surface.inkSoft,
        marginBottom: 6,
      }}>
      {text}
    </Text>
  );
}

/** Selection indicator for the age pills — night-safe (accent ring/dot, no bright fill). */
function SelectDot({ active }: { active: boolean }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: active ? colors.sleep : colors.inkFaint,
      }}>
      {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sleep }} /> : null}
    </View>
  );
}

/** Snappy, low-travel press spring for the choice cards — settles without wobble. */
const CARD_PRESS_SPRING = { damping: 20, stiffness: 320, mass: 0.6 } as const;

/**
 * One age choice as a flat, modern choice-card (one-thumb, roadmap §4): a radio
 * circle on the left, label + helper on the right; the whole card selects.
 *
 * FLAT TREATMENT (no shadow / elevation — white on the peach surface carries the
 * separation, so it's identical on iOS + Android):
 *  - Resting: flat card fill with a soft warm hairline (1px) for definition.
 *  - Selected (the emphasis): a light indigo tint fill, a 2px indigo border in the
 *    Continue-button accent (`colors.sleep`), and the radio filled with the accent.
 *  - Press: the card scales to 0.97 and springs back on the UI thread (Reanimated
 *    worklet). Reduce Motion holds it static; the selection colours change either
 *    way. An optional soft haptic fires on select (expo-haptics).
 */
function AgeOptionCard({
  surface,
  opt,
  active,
  reduceMotion,
  onSelect,
}: {
  surface: SurfacePalette;
  opt: AgeChoice;
  active: boolean;
  reduceMotion: boolean;
  onSelect: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);

  // Press feedback on the UI thread: scale to 0.97 on press-in, spring back on
  // release. Reduce Motion holds it static; the selection colours change either
  // way. Mutate the shared value in an effect placed BEFORE useAnimatedStyle reads
  // it (React Compiler freezes a value once it's captured into a memo), matching
  // TabBarPill / OnboardingFamilyMoment's shared-value ordering.
  useEffect(() => {
    scale.value = withSpring(pressed && !reduceMotion ? 0.97 : 1, CARD_PRESS_SPRING);
  }, [pressed, reduceMotion, scale]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    // Soft selection tick. expo-haptics is a dependency; never let it throw (it's
    // a no-op on devices without a haptic engine).
    Haptics.selectionAsync().catch(() => {});
    onSelect();
  };

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active, checked: active }}
      accessibilityLabel={`${opt.label}. ${opt.hint}`}
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}>
      {/* visual surface on an inner (animated) View, not the Pressable, so the card
          background paints reliably on Android (recorded gotcha) */}
      <Reanimated.View
        style={[
          {
            minHeight: 72,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 18,
            paddingVertical: 16,
            borderRadius: radii.medium,
            backgroundColor: active ? colors.sleepTint : surface.card,
            borderWidth: active ? 2 : 1,
            borderColor: active ? colors.sleep : surface.line,
          },
          pressStyle,
        ]}>
        <SelectDot active={active} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: surface.ink }}>{opt.label}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: surface.inkSoft, marginTop: 2 }}>
            {opt.hint}
          </Text>
        </View>
      </Reanimated.View>
    </Pressable>
  );
}

/** The coarse age picker: one flat choice-card per age bucket, in fixed order. */
function AgePicker({
  surface,
  value,
  reduceMotion,
  onChange,
}: {
  surface: SurfacePalette;
  value: string | null;
  reduceMotion: boolean;
  onChange: (key: string) => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      {AGE_CHOICES.map((opt) => (
        <AgeOptionCard
          key={opt.key}
          surface={surface}
          opt={opt}
          active={opt.key === value}
          reduceMotion={reduceMotion}
          onSelect={() => onChange(opt.key)}
        />
      ))}
    </View>
  );
}

/** Circular Back control for the baby-step top bar. Visual surface sits on an
 *  inner View so it paints reliably on Android (recorded Pressable-bg gotcha). */
function BackButton({ surface, onPress }: { surface: SurfacePalette; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: surface.card,
          borderWidth: 1,
          borderColor: surface.line,
        }}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path
            d="M14.5 5 L8 12 L14.5 19"
            stroke={surface.ink}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
    </Pressable>
  );
}

/**
 * A small step-progress indicator: one dot per rendered onboarding step, the
 * active step drawn as a wider accent pill. Counts/active index are passed in by
 * the caller so it always reflects the real flow rather than a faked length.
 */
function StepDots({
  count,
  activeIndex,
  activeColor = colors.sleep,
  inactiveColor = colors.inkFaint,
}: {
  count: number;
  activeIndex: number;
  activeColor?: string;
  inactiveColor?: string;
}) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Step ${activeIndex + 1} of ${count}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {Array.from({ length: count }).map((_, i) => {
        const active = i === activeIndex;
        return (
          <View
            key={`step-dot-${i}`}
            style={{
              width: active ? 18 : 6,
              height: 6,
              borderRadius: radii.pill,
              backgroundColor: active ? activeColor : inactiveColor,
              opacity: active ? 1 : 0.4,
            }}
          />
        );
      })}
    </View>
  );
}

// Each chip keeps its own accent identity, carried on the box/border/icon/label.
// The selected state reads via the tint fill + 2px accent border (no checkmark).
const FOCUS_CHIP_META: Record<
  OnboardingFocusNeed,
  { label: string; tint: string; accent: string }
> = {
  sleep: { label: 'Sleep', tint: colors.sleepTint, accent: colors.sleep },
  feeding: { label: 'Feeding', tint: colors.feedTint, accent: colors.feed },
  reassurance: { label: 'Reassurance', tint: colors.diaperTint, accent: colors.diaper },
  everything: { label: 'A bit of everything', tint: colors.pumpTint, accent: colors.pump },
};

function FocusNeedIcon({ need, color }: { need: OnboardingFocusNeed; color: string }) {
  const strokeWidth = 1.9;

  if (need === 'feeding') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M9 2h6M10 2v3.5a4 4 0 0 0-1.2 2.8L8 19a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3l-.8-10.7A4 4 0 0 0 14 5.5V2"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
        <Path d="M8.4 12h7.2" stroke={color} strokeWidth={strokeWidth} />
      </Svg>
    );
  }

  if (need === 'reassurance') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M20.4 5.6c-1.7-1.8-4.4-1.8-6.1 0L12 8l-2.3-2.4c-1.7-1.8-4.4-1.8-6.1 0-1.8 1.9-1.8 4.9 0 6.8L12 21l8.4-8.6c1.8-1.9 1.8-4.9 0-6.8Z"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (need === 'everything') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M7.7 18h8.8a4.1 4.1 0 0 0 .5-8.2 5.3 5.3 0 0 0-10.1-1.7A4.9 4.9 0 0 0 7.7 18Z"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * One multi-select focus chip. Flat (no shadow — the tint fill + 2px border carry
 * it), with the same press feel as the age cards: it scales to 0.97 on press-in
 * and springs back on the UI thread (Reanimated). Reduce Motion holds it static;
 * the selection colours change either way. A soft haptic fires on toggle.
 *
 * This component owns presentation + press feedback ONLY. The multi-select rule
 * and the exclusive-"everything" behaviour stay entirely in the parent's onToggle
 * (toggleOnboardingFocusNeed) — `active` is just `selected.includes(need)`, so any
 * number of specific chips can be lit at once.
 */
function FocusChip({
  surface,
  need,
  chip,
  active,
  reduceMotion,
  onToggle,
}: {
  surface: SurfacePalette;
  need: OnboardingFocusNeed;
  chip: (typeof FOCUS_CHIP_META)[OnboardingFocusNeed];
  active: boolean;
  reduceMotion: boolean;
  onToggle: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);

  // Mutate the shared value in an effect placed BEFORE the reading useAnimatedStyle
  // (React Compiler freezes a value once it's captured into a memo).
  useEffect(() => {
    scale.value = withSpring(pressed && !reduceMotion ? 0.97 : 1, CARD_PRESS_SPRING);
  }, [pressed, reduceMotion, scale]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    // Soft toggle tick. expo-haptics is a dependency; never let it throw (it's a
    // no-op on devices without a haptic engine).
    Haptics.selectionAsync().catch(() => {});
    onToggle();
  };

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active, selected: active }}
      accessibilityLabel={chip.label}
      accessibilityHint={
        need === 'everything' ? 'Selecting this clears the other focus choices.' : undefined
      }
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={4}
      style={{ maxWidth: '100%' }}>
      {/* visual surface on the inner (animated) View, not the Pressable, so it
          paints reliably on Android (recorded gotcha) */}
      <Reanimated.View
        style={[
          {
            minHeight: 50,
            maxWidth: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            paddingHorizontal: 13,
            paddingVertical: 11,
            borderRadius: radii.pill,
            backgroundColor: active ? chip.tint : surface.card,
            borderWidth: 2,
            borderColor: active ? chip.accent : surface.line,
          },
          pressStyle,
        ]}>
        <FocusNeedIcon need={need} color={active ? chip.accent : surface.inkSoft} />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.86}
          style={{
            flexShrink: 1,
            fontFamily: fonts.bodyBold,
            fontSize: 15,
            color: active ? chip.accent : surface.ink,
          }}>
          {chip.label}
        </Text>
      </Reanimated.View>
    </Pressable>
  );
}

function FocusNeedPicker({
  surface,
  selected,
  reduceMotion,
  onToggle,
}: {
  surface: SurfacePalette;
  selected: readonly OnboardingFocusNeed[];
  reduceMotion: boolean;
  onToggle: (need: OnboardingFocusNeed) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
      {ONBOARDING_FOCUS_NEEDS.map((need) => (
        <FocusChip
          key={need}
          surface={surface}
          need={need}
          chip={FOCUS_CHIP_META[need]}
          active={selected.includes(need)}
          reduceMotion={reduceMotion}
          onToggle={() => onToggle(need)}
        />
      ))}
    </View>
  );
}

const NIGHT_SHIFT_CHOICE_META: Record<
  OnboardingNightShiftChoice,
  { title: string; subtitle: string }
> = {
  solo: {
    title: 'Just me tonight',
    subtitle: "I'll be doing the logging",
  },
  partner: {
    title: 'Me and a partner',
    subtitle: "We'll share the nights",
  },
  later: {
    title: "We'll sort it later",
    subtitle: 'Skip for now',
  },
};

const NIGHT_SHIFT_CARD_HEIGHT = 96;
const NIGHT_SHIFT_ICON_TILE_SIZE = 56;
const NIGHT_SHIFT_CHECK_SIZE = 16;

function NightShiftIcon({ choice, color }: { choice: OnboardingNightShiftChoice; color: string }) {
  const strokeWidth = 1.9;

  if (choice === 'partner') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Circle cx={9} cy={8.5} r={3.2} stroke={color} strokeWidth={strokeWidth} />
        <Path d="M3.8 20a5.2 5.2 0 0 1 10.4 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Path
          d="M16.8 11.1a2.7 2.7 0 1 0-1.7-5"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <Path
          d="M15.6 15.4a4.8 4.8 0 0 1 4.6 4.6"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (choice === 'later') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={8.6} stroke={color} strokeWidth={strokeWidth} />
        <Path d="M12 7.8v4.7l3 1.8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      </Svg>
    );
  }

  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.4} r={3.4} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M6.2 20a5.8 5.8 0 0 1 11.6 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * One single-select night-shift card. Flat (no shadow — the tint fill + 2px border
 * carry it), reusing the age-card selected treatment: indigo border + light indigo
 * tint + a filled check. Press scales it to 0.97 and springs back on the UI thread
 * (Reanimated); Reduce Motion holds it static while the selection colours still
 * change. A soft haptic fires on selection. Presentation + press feedback only —
 * single-select stays in the parent's onChange.
 */
function NightShiftCard({
  surface,
  choice,
  copy,
  active,
  reduceMotion,
  onSelect,
}: {
  surface: SurfacePalette;
  choice: OnboardingNightShiftChoice;
  copy: { title: string; subtitle: string };
  active: boolean;
  reduceMotion: boolean;
  onSelect: () => void;
}) {
  const iconColor = active ? colors.sleep : surface.inkSoft;

  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);

  // Mutate the shared value in an effect placed BEFORE the reading useAnimatedStyle
  // (React Compiler freezes a value once it's captured into a memo).
  useEffect(() => {
    scale.value = withSpring(pressed && !reduceMotion ? 0.97 : 1, CARD_PRESS_SPRING);
  }, [pressed, reduceMotion, scale]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    // Soft selection tick. expo-haptics is a dependency; never let it throw (it's a
    // no-op on devices without a haptic engine).
    Haptics.selectionAsync().catch(() => {});
    onSelect();
  };

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active, checked: active }}
      accessibilityLabel={`${copy.title}. ${copy.subtitle}`}
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ width: '100%' }}>
      {/* visual surface on the inner (animated) View, not the Pressable, so it
          paints reliably on Android (recorded gotcha) */}
      <Reanimated.View
        style={[
          {
            width: '100%',
            height: NIGHT_SHIFT_CARD_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            paddingHorizontal: 18,
            paddingVertical: 16,
            borderRadius: radii.medium,
            backgroundColor: active ? colors.sleepTint : surface.card,
            borderWidth: 2,
            borderColor: active ? colors.sleep : surface.line,
          },
          pressStyle,
        ]}>
        <View
          style={{
            width: NIGHT_SHIFT_ICON_TILE_SIZE,
            height: NIGHT_SHIFT_ICON_TILE_SIZE,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? surface.card : surface.bg,
            borderWidth: 1,
            borderColor: active ? colors.sleep : surface.line,
          }}>
          <NightShiftIcon choice={choice} color={iconColor} />
          <View
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: NIGHT_SHIFT_CHECK_SIZE,
              height: NIGHT_SHIFT_CHECK_SIZE,
              borderRadius: NIGHT_SHIFT_CHECK_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.sleep : 'transparent',
              opacity: active ? 1 : 0,
            }}>
            <Svg width={9} height={9} viewBox="0 0 12 12" fill="none">
              <Path
                d="M2.4 6.1 4.9 8.5 9.6 3.6"
                stroke={colors.white}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </Svg>
          </View>
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: surface.ink }}>
            {copy.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: fonts.body,
              fontSize: 13,
              lineHeight: 18,
              color: surface.inkSoft,
              marginTop: 3,
            }}>
            {copy.subtitle}
          </Text>
        </View>
      </Reanimated.View>
    </Pressable>
  );
}

function NightShiftChoicePicker({
  surface,
  selected,
  reduceMotion,
  onChange,
}: {
  surface: SurfacePalette;
  selected: OnboardingNightShiftChoice | null;
  reduceMotion: boolean;
  onChange: (choice: OnboardingNightShiftChoice) => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      {ONBOARDING_NIGHT_SHIFT_CHOICES.map((choice) => (
        <NightShiftCard
          key={choice}
          surface={surface}
          choice={choice}
          copy={NIGHT_SHIFT_CHOICE_META[choice]}
          active={choice === selected}
          reduceMotion={reduceMotion}
          onSelect={() => onChange(choice)}
        />
      ))}
    </View>
  );
}

function TextBackButton({ surface, onPress }: { surface: SurfacePalette; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        minHeight: 40,
        justifyContent: 'center',
        paddingRight: 12,
        opacity: pressed ? 0.62 : 1,
      })}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20, color: surface.inkSoft }}>
        {'‹ Back'}
      </Text>
    </Pressable>
  );
}

/**
 * Optional baby-name input. A local, surface-tinted field rather than the shared
 * `AuthField` (which hardcodes the day palette) so the night scaffold stays
 * low-glare. Name is optional and off the critical path (the keyboard never
 * blocks the bottom CTA — the orb is pinned top, the CTA bottom).
 */
function NameField({
  surface,
  value,
  onChangeText,
}: {
  surface: SurfacePalette;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View>
      <FieldLabel surface={surface} text="Baby's name (optional)" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="e.g. Mia"
        placeholderTextColor={surface.inkFaint}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={40}
        style={{
          fontFamily: fonts.body,
          fontSize: 15,
          color: surface.ink,
          backgroundColor: surface.card,
          borderRadius: radii.small,
          borderWidth: 1,
          borderColor: surface.line,
          paddingHorizontal: 14,
          paddingVertical: 13,
        }}
      />
    </View>
  );
}

/**
 * The four things Lullaby tracks, as soft warm tinted pills (decorative, not a
 * SaaS checklist). Each chip reuses its category's existing tint + accent token
 * so the row reads native to the app; text-only, no borders, no loud fills.
 */
const TRACK_CHIPS: { label: string; tint: string; ink: string }[] = [
  { label: 'Feed', tint: colors.feedTint, ink: colors.feed },
  { label: 'Sleep', tint: colors.sleepTint, ink: colors.sleep },
  { label: 'Diaper', tint: colors.diaperTint, ink: colors.diaper },
  { label: 'Pump', tint: colors.pumpTint, ink: colors.pump },
];

/** A calm, non-interactive preview row of what the app tracks (Feed · Sleep ·
 *  Diaper · Pump). Plain Views — no press handlers — so it stays purely visual. */
function TrackingPreview() {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Tracks feeds, sleep, diapers, and pumping"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {TRACK_CHIPS.map((chip) => (
        <View
          key={chip.label}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: radii.pill,
            backgroundColor: chip.tint,
          }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: chip.ink }}>{chip.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Low-emphasis text action (Begin's "Set up later", baby step's Back / Skip). */
function LinkButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color }}>{label}</Text>
    </Pressable>
  );
}

export function OnboardingScreen({ onComplete }: Props) {
  const flow = useOnboardingFlow();
  const { createLocalBaby, session } = useAuth();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();

  // First-run onboarding is always warm/light — never the navy night scaffold —
  // so the welcome reads calm and inviting regardless of the hour.
  const mode: SurfaceMode = 'day';
  const surface = surfaces[mode];

  const [ageKey, setAgeKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [focusNeeds, setFocusNeeds] = useState<OnboardingFocusNeed[]>([]);
  // Pre-select the most common answer ("Just me tonight") so Continue advances
  // with zero selection taps; the parent can still change it. The choice is not
  // persisted, so the default is presentational only.
  const [nightShiftChoice, setNightShiftChoice] =
    useState<OnboardingNightShiftChoice | null>('solo');

  const selectedAge = AGE_CHOICES.find((a) => a.key === ageKey) ?? null;
  const trimmedName = name.trim();
  const displayName = trimmedName.length > 0 ? trimmedName : null;
  const focusTitleName = displayName ?? 'your baby';
  const nightShiftBabyName = displayName ?? 'the baby';

  // What we persist on reaching `creating` (skip -> {} defaults; submit -> answers).
  const pendingInputRef = useRef<CreateLocalBabyInput>({});
  const completingRef = useRef(false);
  const localBabyCreatedRef = useRef(false);
  const [completionAttempt, setCompletionAttempt] = useState(0);
  const [completionFailed, setCompletionFailed] = useState(false);
  const [handoffTextFade] = useState(() => new Animated.Value(1));

  // Defensive tripwire (dev-only via authWarn): OnboardingScreen must ONLY ever
  // mount in a no-session flow (signed-out / local-only). If a session exists we are
  // in a bad route — a regression that would replay onboarding after sign-in — so
  // warn. The createLocalBaby path below is independently gated on `!session`, so no
  // account identity / local events are touched even if this ever fires.
  useEffect(() => {
    if (session != null) {
      authWarn('OnboardingScreen mounted with an active session — onboarding must never replay after sign-in');
    }
  }, [session]);

  // Run the real completion exactly once on entering `creating`: write the local
  // baby + clear the seed night (createLocalBaby), then mark complete + reveal
  // Tonight (onComplete) — the §11 ordering. Local baby write stays best-effort;
  // if reveal fails, the night handoff remains mounted with a retry CTA.
  useEffect(() => {
    if (flow.step !== 'creating' || completingRef.current) return;
    completingRef.current = true;
    setCompletionFailed(false);
    let active = true;
    (async () => {
      if (!localBabyCreatedRef.current) {
        // Persist the onboarding baby draft (non-sensitive: name + birth date) so a
        // later Google/account sign-in can PREFILL baby setup instead of re-asking.
        try {
          await saveOnboardingDraft({
            babyName: pendingInputRef.current.babyName ?? null,
            birthDate: pendingInputRef.current.birthDate ?? null,
          });
        } catch {
          // best-effort — a lost draft only means the setup form starts blank
        }
        // Local-first ONLY: mint the local baby when there is NO Supabase session.
        // With a session active (e.g. the dev force-onboarding replay), never
        // overwrite the account identity or clear local events — the draft above
        // carries the setup forward into account provisioning instead.
        if (!session) {
          try {
            await createLocalBaby(pendingInputRef.current);
          } catch {
            // best-effort local write — losing it is not worth stranding the parent
          }
        }
        localBabyCreatedRef.current = true;
      }
      try {
        await onComplete();
      } catch {
        if (active) {
          completingRef.current = false;
          setCompletionFailed(true);
          handoffTextFade.setValue(1);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [flow, createLocalBaby, onComplete, completionAttempt, handoffTextFade, session]);

  useEffect(() => {
    if (flow.step !== 'creating') {
      handoffTextFade.setValue(1);
      return;
    }
    if (reduceMotion || completionFailed) {
      handoffTextFade.setValue(1);
      return;
    }

    const animation = Animated.timing(handoffTextFade, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [flow.step, reduceMotion, completionFailed, handoffTextFade, completionAttempt]);

  const startNightCompletion = () => {
    if (reduceMotion) {
      handoffTextFade.setValue(1);
    } else {
      handoffTextFade.setValue(0);
    }
    setCompletionFailed(false);
    flow.submit();
  };

  const retryCompletion = () => {
    if (completingRef.current) return;
    if (reduceMotion) {
      handoffTextFade.setValue(1);
    } else {
      handoffTextFade.setValue(0);
    }
    setCompletionFailed(false);
    setCompletionAttempt((attempt) => attempt + 1);
  };

  if (flow.step === 'beat') {
    return (
      <OnboardingStepLayout
        mode={mode}
        centerContent
        hero={<OnboardingFamilyMoment mode={mode} reduceMotion={reduceMotion} />}
        title="Lullaby"
        subtitle="For the long nights with a new baby."
        cta={<AuthButton label="Begin" onPress={flow.begin} />}
        secondaryCta={
          <LinkButton
            label="Set up later"
            color={colors.sleep}
            onPress={() => {
              pendingInputRef.current = {};
              setFocusNeeds([]);
              setNightShiftChoice(null);
              flow.skip();
            }}
          />
        }>
        <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: surface.inkSoft }}>
          {"Tap once to save what just happened, so you don't have to hold it all in your head at 3 a.m."}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: surface.inkSoft }}>
          {"When someone else takes over, they can see how the night went. No waking you to ask."}
        </Text>
        <TrackingPreview />
      </OnboardingStepLayout>
    );
  }

  if (flow.step === 'baby') {
    const onContinue = () => {
      if (!selectedAge) return;
      pendingInputRef.current = {
        babyName: displayName,
        birthDate: birthDateFromWeeks(selectedAge.weeks),
      };
      flow.submit();
    };
    return (
      <OnboardingStepLayout
        mode={mode}
        topBar={
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <BackButton surface={surface} onPress={flow.back} />
            {/* beat -> baby -> focus -> night shift -> reassurance: baby is 2 of 5 */}
            <StepDots count={5} activeIndex={1} />
          </View>
        }
        title="Who are we helping tonight?"
        subtitle="Pick whatever's closest. You can change it later."
        cta={<AuthButton label="Continue" onPress={onContinue} disabled={!selectedAge} />}
        secondaryCta={
          <LinkButton
            label="Skip for now"
            color={colors.sleep}
            onPress={() => {
              pendingInputRef.current = {};
              setFocusNeeds([]);
              setNightShiftChoice(null);
              flow.skip();
            }}
          />
        }>
        <AgePicker surface={surface} value={ageKey} reduceMotion={reduceMotion} onChange={setAgeKey} />
        <NameField surface={surface} value={name} onChangeText={setName} />
        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: surface.inkFaint }}>
          Stays on this phone. No account needed.
        </Text>
      </OnboardingStepLayout>
    );
  }

  if (flow.step === 'focus') {
    const onToggleFocusNeed = (need: OnboardingFocusNeed) => {
      setFocusNeeds((current) => toggleOnboardingFocusNeed(current, need));
    };

    return (
      <OnboardingStepLayout
        mode={mode}
        topBar={
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <BackButton surface={surface} onPress={flow.back} />
            <StepDots count={5} activeIndex={2} />
          </View>
        }
        title={`What's hardest with ${focusTitleName} right now?`}
        subtitle="We'll start tonight with what you need most. Tap any that fit."
        cta={<AuthButton label="Continue" onPress={flow.submit} />}
        secondaryCta={
          <LinkButton
            label="Skip for now"
            color={colors.sleep}
            onPress={() => {
              setFocusNeeds([]);
              setNightShiftChoice(null);
              flow.skip();
            }}
          />
        }>
        <FocusNeedPicker
          surface={surface}
          selected={focusNeeds}
          reduceMotion={reduceMotion}
          onToggle={onToggleFocusNeed}
        />
      </OnboardingStepLayout>
    );
  }

  if (flow.step === 'nightShift') {
    return (
      <OnboardingStepLayout
        mode={mode}
        topBar={
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TextBackButton surface={surface} onPress={flow.back} />
            <StepDots count={5} activeIndex={3} />
          </View>
        }
        title="Who's on the night shift?"
        subtitle={`No more "did you feed ${nightShiftBabyName} at 3 a.m.?" Everyone's logs stay in one place.`}
        cta={
          <AuthButton
            label="Continue"
            onPress={flow.submit}
            disabled={!hasOnboardingNightShiftChoice(nightShiftChoice)}
          />
        }>
        <NightShiftChoicePicker
          surface={surface}
          selected={nightShiftChoice}
          reduceMotion={reduceMotion}
          onChange={setNightShiftChoice}
        />
      </OnboardingStepLayout>
    );
  }

  if (flow.step === 'nightReassurance' || flow.step === 'creating') {
    const isOpening = flow.step === 'creating';
    const nightSurface = surfaces.night;
    const handoffTitle = completionFailed
      ? 'Tonight needs one more try.'
      : isOpening
        ? 'Opening Tonight…'
        : "You're not alone tonight.";
    const handoffBody = completionFailed
      ? "Something got interrupted while opening. Try again when you're ready."
      : isOpening
        ? 'Your night shift is ready.'
        : 'Somewhere out there, other parents are up right now too. Lullaby stays with you through the long hours.';
    const showReassurancePill = !isOpening && !completionFailed;
    return (
      <View style={{ flex: 1, backgroundColor: '#101124' }}>
        {/* Dark surface → light status-bar glyphs (nested entry wins while mounted,
            then reverts to the app's theme-driven bar on the cream steps). */}
        <StatusBar style="light" />
        <OnboardingNightSky reduceMotion={reduceMotion} />
        <View
          style={{
            flex: 1,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 18,
            paddingHorizontal: 22,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {isOpening ? (
              <View
                importantForAccessibility="no-hide-descendants"
                style={{ width: 68, minHeight: 40 }}
              />
            ) : (
              <TextBackButton surface={nightSurface} onPress={flow.back} />
            )}
            <StepDots
              count={5}
              activeIndex={4}
              activeColor={colors.feed}
              inactiveColor="rgba(255,255,255,0.5)"
            />
          </View>

          <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 34 }}>
            <Animated.View style={{ maxWidth: 340, opacity: handoffTextFade }}>
              <Text
                style={{
                  fontFamily: fonts.display,
                  fontSize: 36,
                  lineHeight: 46,
                  color: '#FFF8F0',
                }}>
                {handoffTitle}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.body,
                  fontSize: 16,
                  lineHeight: 23,
                  color: '#D8D3EA',
                  marginTop: 14,
                }}>
                {handoffBody}
              </Text>
              <View style={{ minHeight: 36, marginTop: 18, justifyContent: 'flex-start' }}>
                {showReassurancePill ? (
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: radii.pill,
                      backgroundColor: 'rgba(255,122,61,0.16)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,158,94,0.28)',
                    }}>
                    <Text
                      style={{
                        fontFamily: fonts.bodyBold,
                        fontSize: 13,
                        lineHeight: 18,
                        color: '#FFD8B9',
                      }}>
                      Made for the 3 a.m. shift
                    </Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>
          </View>

          <View style={{ paddingTop: 8 }}>
            <AuthButton
              label={completionFailed ? 'Try again' : isOpening ? 'Opening Tonight…' : "I'm ready"}
              onPress={completionFailed ? retryCompletion : startNightCompletion}
              accentColor={colors.feed}
              busy={isOpening && !completionFailed}
              disabled={isOpening && !completionFailed}
            />
            {completionFailed ? (
              <Text
                accessibilityRole="alert"
                style={{
                  fontFamily: fonts.body,
                  fontSize: 13,
                  lineHeight: 18,
                  color: '#D8D3EA',
                  textAlign: 'center',
                  marginTop: 10,
                }}>
                Your setup is safe. We can try opening Tonight again.
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  // Fallback only; the reducer should only leave the screen after completion.
  return (
    <View style={{ flex: 1, backgroundColor: '#101124' }}>
      {/* Dark surface → light status-bar glyphs (see the primary handoff branch). */}
      <StatusBar style="light" />
      <OnboardingNightSky reduceMotion={reduceMotion} />
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 18,
          paddingHorizontal: 22,
          justifyContent: 'flex-end',
        }}>
        <View style={{ paddingBottom: 34 }}>
          <Text
            style={{
              fontFamily: fonts.display,
              fontSize: 36,
              lineHeight: 46,
              color: '#FFF8F0',
            }}>
            Opening Tonight…
          </Text>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 16,
              lineHeight: 23,
              color: '#D8D3EA',
              marginTop: 14,
            }}>
            Your night shift is ready.
          </Text>
        </View>
      </View>
    </View>
  );
}

export default OnboardingScreen;
