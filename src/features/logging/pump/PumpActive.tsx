/**
 * Logging v2 — active pump session (plan Phase 7 active UI).
 *
 * Shows the live elapsed time and the side, with "Finish pumping" to stop. The
 * duration is DERIVED from the stored `startedAt` every tick — nothing counted
 * here is persisted (plan §5/§6), so closing and reopening the sheet, or
 * restarting the app, recomputes the same value.
 *
 * Finishing does NOT complete the pump — it moves it into the volume draft. Cancel
 * is visually separated from finish (plan §10): Cancel discards the session
 * entirely (never reaches the timeline). Mirrors `SleepActive`.
 */
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii } from '@/theme';

import type { PumpEvent } from '../domain/types';
import { formatClock } from '../timer/sessionMath';
import { useElapsedTime } from '../timer/useElapsedTime';

type Props = {
  event: PumpEvent;
  accentColor: string;
  onFinish: () => void;
  onCancel: () => void;
};

/** "Left" / "Right" / "Both" for the active side. */
function sideLabel(side: PumpEvent['details']['side']): string {
  return side === 'both' ? 'Both' : side === 'left' ? 'Left' : 'Right';
}

export function PumpActive({ event, accentColor, onFinish, onCancel }: Props) {
  // Display-only tick; the value is derived from `startedAt`, not stored.
  const elapsed = useElapsedTime(event.startedAt, true);

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
          {formatClock(elapsed)}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginTop: 4 }}>
          {sideLabel(event.details.side)}
        </Text>
      </View>

      <View style={{ marginTop: 20, alignItems: 'center' }}>
        <PrimaryActionButton label="Finish pumping" accentColor={accentColor} onPress={onFinish} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel pump session"
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

export default PumpActive;
