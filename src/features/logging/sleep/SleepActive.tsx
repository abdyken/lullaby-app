/**
 * Logging v2 — active sleep session (plan Phase 6 active UI).
 *
 * Shows the live elapsed time and the wall-clock start, with "Baby woke up" to
 * finish. The duration is DERIVED from the stored `startedAt` every tick —
 * nothing counted here is persisted (plan §5/§6), so closing and reopening the
 * sheet, or restarting the app, recomputes the same value.
 *
 * Cancel is visually separated from finish (plan §10): "Baby woke up" logs a
 * completed sleep, Cancel discards the session entirely (never reaches the
 * timeline). Mirrors `BreastFeedActive`.
 */
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii } from '@/theme';

import type { SleepEvent } from '../domain/types';
import { formatClock } from '../timer/sessionMath';
import { useElapsedTime } from '../timer/useElapsedTime';

type Props = {
  event: SleepEvent;
  accentColor: string;
  onFinish: () => void;
  onCancel: () => void;
};

/** Wall-clock "14:10" for the session start (display-only, device locale). */
function formatStartedAt(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function SleepActive({ event, accentColor, onFinish, onCancel }: Props) {
  // Display-only tick; the value is derived from `startedAt`, not stored.
  const elapsed = useElapsedTime(event.startedAt, true);
  const startedLabel = formatStartedAt(event.startedAt);

  return (
    <View style={{ marginTop: 16 }}>
      <View
        style={{
          backgroundColor: colors.surfaceSoft,
          borderRadius: radii.medium,
          paddingHorizontal: 16,
          paddingVertical: 18,
          alignItems: 'center',
        }}>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: 40,
            color: colors.ink,
            fontVariant: ['tabular-nums'],
          }}>
          {formatClock(elapsed, { alwaysHours: true })}
        </Text>
        {startedLabel !== '' && (
          <Text
            style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginTop: 4 }}>
            Started {startedLabel}
          </Text>
        )}
      </View>

      <View style={{ marginTop: 20, alignItems: 'center' }}>
        <PrimaryActionButton label="Baby woke up" accentColor={accentColor} onPress={onFinish} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel sleep session"
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

export default SleepActive;
