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
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii } from '@/theme';

import type { BreastFeedEvent, BreastSide } from '../domain/types';
import { breastSegmentTotals, formatClock, formatCompactDuration } from '../timer/sessionMath';
import { useElapsedTime } from '../timer/useElapsedTime';
import { ChoicePill } from './ChoicePill';

type Props = {
  event: BreastFeedEvent;
  accentColor: string;
  accentTint: string;
  onSwitch: (side: BreastSide) => void;
  onFinish: () => void;
  onCancel: () => void;
};

const SIDE_LABEL: Record<BreastSide, string> = { left: 'Left', right: 'Right' };

function StatRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        paddingVertical: 5,
      }}>
      <Text
        style={{
          fontFamily: strong ? fonts.bodyBold : fonts.body,
          fontSize: strong ? 15 : 13.5,
          color: strong ? colors.ink : colors.inkSoft,
        }}>
        {label}
      </Text>
      <Text
        style={{
          fontFamily: fonts.display,
          fontSize: strong ? 26 : 16,
          color: strong ? colors.ink : colors.inkSoft,
          fontVariant: ['tabular-nums'],
        }}>
        {value}
      </Text>
    </View>
  );
}

export function BreastFeedActive({
  event,
  accentColor,
  accentTint,
  onSwitch,
  onFinish,
  onCancel,
}: Props) {
  // Display-only tick; the value is derived from `startedAt`, not stored.
  const elapsed = useElapsedTime(event.startedAt, true);
  const startMs = event.startedAt ? Date.parse(event.startedAt) : 0;
  const now = startMs + elapsed;
  const { totalLeftMs, totalRightMs } = breastSegmentTotals(event.details.segments, now);
  const activeSide = event.details.activeSide;

  return (
    <View style={{ marginTop: 12 }}>
      <View
        style={{
          backgroundColor: colors.surfaceSoft,
          borderRadius: radii.medium,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}>
        <StatRow label="Total" value={formatClock(elapsed)} strong />
        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />
        <StatRow label="Left" value={formatCompactDuration(totalLeftMs)} />
        <StatRow label="Right" value={formatCompactDuration(totalRightMs)} />
      </View>

      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 11,
          letterSpacing: 1,
          color: colors.inkFaint,
          marginTop: 16,
          marginBottom: 8,
        }}>
        SWITCH SIDE
      </Text>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {(['left', 'right'] as const).map((s) => (
          <ChoicePill
            key={s}
            label={SIDE_LABEL[s]}
            accessibilityLabel={`Switch to ${SIDE_LABEL[s].toLowerCase()} breast`}
            active={activeSide === s}
            accentColor={accentColor}
            accentTint={accentTint}
            onPress={() => onSwitch(s)}
          />
        ))}
      </View>

      <View style={{ marginTop: 20, alignItems: 'center' }}>
        <PrimaryActionButton label="Finish feeding" accentColor={accentColor} onPress={onFinish} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel feeding session"
        onPress={onCancel}
        hitSlop={8}
        style={({ pressed }) => ({
          marginTop: 12,
          alignSelf: 'center',
          paddingVertical: 8,
          paddingHorizontal: 14,
          opacity: pressed ? 0.5 : 1,
        })}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}>
          Cancel session
        </Text>
      </Pressable>
    </View>
  );
}

export default BreastFeedActive;
