/**
 * Logging v2 — active breastfeeding session (plan Phase 5 active UI).
 *
 * Shows the live total + per-side durations, the side switch, and Finish. All
 * durations are DERIVED from the stored segment timestamps every tick — nothing
 * counted here is persisted (plan §5/§6), so closing and reopening the sheet, or
 * restarting the app, recomputes the same values. The open segment counts up to
 * `now`; switching closes it and opens the other side (handled by the use-case).
 *
 * Cancel is visually separated from Finish (plan §10): Finish logs a completed
 * feed, Cancel discards the session entirely (never reaches the timeline).
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, shadows } from '@/theme';

import type { BreastFeedEvent, BreastSide } from '../domain/types';
import { breastSegmentTotals, formatClock, formatCompactDuration } from '../timer/sessionMath';
import { FeedSegmentedControl, type FeedSegmentedOption } from './FeedSegmentedControl';

type Props = {
  event: BreastFeedEvent;
  accentColor: string;
  onSwitch: (side: BreastSide) => void;
  onFinish: () => void;
  onCancel: () => void;
};

const SIDE_LABEL: Record<BreastSide, string> = { left: 'Left', right: 'Right' };
const SIDE_OPTIONS: FeedSegmentedOption<BreastSide>[] = [
  { value: 'left', label: SIDE_LABEL.left, accessibilityLabel: 'Switch to left breast' },
  { value: 'right', label: SIDE_LABEL.right, accessibilityLabel: 'Switch to right breast' },
];

export function BreastFeedActive({
  event,
  accentColor,
  onSwitch,
  onFinish,
  onCancel,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, []);

  // Display-only tick; the value is derived from `startedAt`, not stored.
  const startMs = event.startedAt ? Date.parse(event.startedAt) : nowMs;
  const elapsed = Math.max(0, nowMs - startMs);
  const { totalLeftMs, totalRightMs } = breastSegmentTotals(event.details.segments, nowMs);
  const activeSide = event.details.activeSide;
  const activeSideLabel = activeSide ? SIDE_LABEL[activeSide] : null;

  return (
    <View style={styles.root}>
      {activeSideLabel && (
        <View style={styles.statusChip}>
          <View style={[styles.statusDot, { backgroundColor: accentColor }]} />
          <Text style={styles.statusText}>{activeSideLabel} side is active</Text>
        </View>
      )}

      <View style={styles.timerCard}>
        <Text style={styles.timerLabel}>TOTAL FEEDING TIME</Text>
        <Text style={styles.timerValue}>{formatClock(elapsed)}</Text>
        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>LEFT</Text>
            <Text style={styles.metricValue}>{formatCompactDuration(totalLeftMs)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>RIGHT</Text>
            <Text style={styles.metricValue}>{formatCompactDuration(totalRightMs)}</Text>
          </View>
        </View>
      </View>

      <Text
        style={styles.kicker}>
        SWITCH SIDE
      </Text>
      <View style={styles.segmentedWrap}>
        <FeedSegmentedControl value={activeSide} options={SIDE_OPTIONS} onChange={onSwitch} />
      </View>
      <View style={{ height: 24 }} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Finish feeding"
        onPress={onFinish}
        hitSlop={8}
        style={({ pressed }) => [styles.finishPressable, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <View style={[styles.finishSurface, { backgroundColor: accentColor, shadowColor: accentColor }]}>
          <Text style={styles.finishText}>Finish feeding</Text>
        </View>
      </Pressable>
      <View style={{ height: 28 }} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel feeding session"
        onPress={onCancel}
        hitSlop={8}
        style={({ pressed }) => ({
          marginTop: 0,
          alignSelf: 'center',
          paddingVertical: 8,
          paddingHorizontal: 14,
          opacity: pressed ? 0.5 : 1,
        })}>
        <Text style={styles.cancelText}>Cancel this session</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 14,
    alignItems: 'stretch',
  },
  statusChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 11,
    marginBottom: 16,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    color: colors.inkSoft,
  },
  timerCard: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 24,
    paddingVertical: 19,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  timerLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.inkFaint,
  },
  timerValue: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 46,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  metricRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 8,
    ...shadows.card,
  },
  metricLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10.5,
    letterSpacing: 0.6,
    color: colors.inkFaint,
  },
  metricValue: {
    fontFamily: fonts.displayMedium,
    fontSize: 20,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  kicker: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.inkFaint,
    marginTop: 18,
    marginBottom: 8,
  },
  segmentedWrap: {
    width: '100%',
    alignSelf: 'stretch',
  },
  finishPressable: {
    width: '100%',
    alignSelf: 'stretch',
    marginTop: 0,
    borderRadius: 20,
  },
  finishSurface: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  finishText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15.5,
    color: colors.white,
    textAlign: 'center',
  },
  cancelText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    color: colors.inkSoft,
    textAlign: 'center',
  },
});

export default BreastFeedActive;
