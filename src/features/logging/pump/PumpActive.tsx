/**
 * PumpActive — shows the running pump timer.
 *
 * Displays elapsed time and selected side. "Finish pumping" stops the timer
 * and opens the volume draft; "Cancel session" removes the event entirely.
 */
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts } from '@/theme';
import type { PumpEvent } from '../domain/types';
import { formatElapsedTime } from '../timer/sessionMath';
import { useElapsedTime } from '../timer/useElapsedTime';

interface Props {
  event: PumpEvent;
  accentColor: string;
  onFinish: () => void;
  onCancel: () => void;
}

export function PumpActive({ event, accentColor, onFinish, onCancel }: Props) {
  const elapsedMs = useElapsedTime(event.startedAt, true);
  const side = event.details.side;
  const sideLabel = side === 'left' ? 'Left' : side === 'right' ? 'Right' : 'Both';

  return (
    <View style={{ gap: 18 }}>
      {/* Timer display */}
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text
          style={{ fontFamily: fonts.display, fontSize: 40, color: colors.ink, letterSpacing: -1 }}
          accessibilityLiveRegion="off">
          {formatElapsedTime(elapsedMs)}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}>
          {sideLabel}
        </Text>
      </View>

      {/* Finish */}
      <View style={{ alignItems: 'center' }}>
        <PrimaryActionButton label="Finish pumping" accentColor={accentColor} onPress={onFinish} />
      </View>

      {/* Cancel — destructive, visually separated */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel pump session"
        onPress={onCancel}
        style={{ alignItems: 'center', paddingVertical: 4 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}>
          Cancel session
        </Text>
      </Pressable>
    </View>
  );
}
