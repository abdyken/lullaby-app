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
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme';

import type { PumpEvent } from '../domain/types';
import { elapsedMs, formatClock } from '../timer/sessionMath';
import { PumpActionStack } from './PumpActionStack';

type Props = {
  event: PumpEvent;
  accentColor: string;
  onFinish: () => void;
  onCancel: () => void;
};

export function PumpActive({ event, accentColor, onFinish, onCancel }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Display-only tick; the value is derived from `startedAt`, not stored.
  const elapsed = event.startedAt === null ? 0 : elapsedMs(event.startedAt, null, nowMs);

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, [event.startedAt]);

  return (
    <View style={{ marginTop: 20 }}>
      <View
        style={{
          backgroundColor: colors.surfaceSoft,
          borderRadius: radii.medium,
          paddingHorizontal: 18,
          paddingVertical: 22,
          alignItems: 'center',
        }}>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 11,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: colors.inkFaint,
          }}>
          Pumping time
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: 42,
            color: colors.ink,
            fontVariant: ['tabular-nums'],
            lineHeight: 48,
            marginTop: 4,
          }}>
          {formatClock(elapsed)}
        </Text>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, lineHeight: 17, color: colors.inkSoft, marginTop: 4 }}>
          Volume is entered after finishing
        </Text>
      </View>

      <PumpActionStack
        primaryLabel="Finish pumping"
        accentColor={accentColor}
        onPrimaryPress={onFinish}
        secondaryLabel="Cancel this session"
        onSecondaryPress={onCancel}
        marginTop={18}
      />
    </View>
  );
}

export default PumpActive;
