/**
 * FirstLogCoach + TonightCalibrating — the brand-new-night Tonight nudges
 * (onboarding Phase 1A "Personalized Tonight", roadmap §7E/§7F/§9).
 *
 * TonightCalibrating: a quiet, honest empty-state line under the status strip.
 *
 * FirstLogCoach: a small dismissible card placed between the status strip and
 * the quick-log row. Before the first log it nudges the first tap (a caret down
 * to the row below); the moment the first event lands it points the eye UP at
 * the TonightStatus strip — the recurring "time since last…" value — then can be
 * dismissed for good. It is zero-real-events-gated, hydration-aware (it never
 * renders before the persisted dismissal + the "started empty" observation
 * resolve — the "V2 Tonight must not render before hydration" postmortem), and
 * it never blocks the tap (it sits above the row, not over it).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';
import {
  FIRST_LOG_COACH_DISMISSED_KEY,
  firstLogNudgeText,
  firstLogThreadText,
  resolveFirstLogCoachPhase,
  tonightCalibratingText,
} from './firstLogCoach';

const DISMISSED_VALUE = 'true';

async function loadDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FIRST_LOG_COACH_DISMISSED_KEY)) === DISMISSED_VALUE;
  } catch {
    return false;
  }
}

async function persistDismissed(): Promise<void> {
  try {
    await AsyncStorage.setItem(FIRST_LOG_COACH_DISMISSED_KEY, DISMISSED_VALUE);
  } catch {
    // A lost dismissal write is harmless — the coach just re-checks next launch.
  }
}

/** Quiet calibrating line, shown under the status strip while nothing is logged. */
export function TonightCalibrating({
  babyName,
  surfaceMode = 'day',
}: {
  babyName: string;
  surfaceMode?: SurfaceMode;
}) {
  const palette = surfaces[surfaceMode];
  return (
    <Text
      style={{
        fontFamily: fonts.body,
        fontSize: 12.5,
        lineHeight: 17,
        color: palette.inkSoft,
        textAlign: 'center',
        paddingHorizontal: 8,
      }}>
      {tonightCalibratingText(babyName)}
    </Text>
  );
}

/** A small filled triangle hinting which way the coach is pointing the eye. */
function CoachCaret({ direction, color }: { direction: 'up' | 'down'; color: string }) {
  const d = direction === 'down' ? 'M2 3 L12 3 L7 9 Z' : 'M7 3 L12 9 L2 9 Z';
  return (
    <Svg width={14} height={12} viewBox="0 0 14 12" fill="none">
      <Path d={d} fill={color} />
    </Svg>
  );
}

type CoachProps = {
  babyName: string;
  /** at least one real event exists (resolved against the flag-correct store) */
  hasRealEvents: boolean;
  surfaceMode?: SurfaceMode;
};

export function FirstLogCoach({ babyName, hasRealEvents, surfaceMode = 'day' }: CoachProps) {
  // null = the persisted dismissal is still loading.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  // Latched at the first (post-hydration) render: did this session start before
  // any real log? The initializer runs exactly once, so a later first log flips
  // the `hasRealEvents` prop without changing this. Only a parent who started
  // empty gets the post-log "thread" pointer — a returning parent with a timeline
  // (started non-empty) never does.
  const [startedEmpty] = useState(() => !hasRealEvents);

  useEffect(() => {
    let active = true;
    void loadDismissed().then((value) => {
      if (active) setDismissed(value);
    });
    return () => {
      active = false;
    };
  }, []);

  const phase = resolveFirstLogCoachPhase({
    hydrated: dismissed !== null,
    dismissed: dismissed === true,
    hasRealEvents,
    startedEmpty,
  });

  if (phase === 'hidden') return null;

  const handleDismiss = () => {
    setDismissed(true);
    void persistDismissed();
  };

  const isNight = surfaceMode === 'night';
  const text = phase === 'nudge' ? firstLogNudgeText(babyName) : firstLogThreadText();
  // nudge points DOWN to the quick-log row below; thread points UP to the status
  // strip above. The card sits between them, so one placement serves both.
  const caret = phase === 'nudge' ? 'down' : 'up';

  return (
    <View
      // marginTop lives on the root so a hidden coach (return null) leaves no gap
      // before the quick-log row — index.tsx renders it without a spacer wrapper.
      style={{
        marginTop: 13,
        backgroundColor: isNight ? surfaces.night.card : colors.feedTint,
        borderRadius: radii.medium,
        borderWidth: isNight ? 1 : 0,
        borderColor: surfaces.night.border,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        ...shadows.card,
      }}>
      <CoachCaret direction={caret} color={isNight ? surfaces.night.inkSoft : colors.feed} />
      <Text
        style={{
          flex: 1,
          fontFamily: fonts.body,
          fontSize: 13,
          lineHeight: 18,
          color: isNight ? surfaces.night.ink : colors.ink,
        }}>
        {text}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss tip"
        onPress={handleDismiss}
        hitSlop={10}
        style={({ pressed }) => ({ paddingVertical: 4, paddingHorizontal: 2, opacity: pressed ? 0.5 : 1 })}>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 12,
            color: isNight ? surfaces.night.inkFaint : colors.inkSoft,
          }}>
          {phase === 'thread' ? 'Got it' : 'Not now'}
        </Text>
      </Pressable>
    </View>
  );
}

export default FirstLogCoach;
