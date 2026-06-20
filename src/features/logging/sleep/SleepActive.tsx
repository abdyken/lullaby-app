/**
 * SleepActive — shows the running sleep timer.
 *
 * Displays total elapsed time and the wall-clock start time.
 * "Baby woke up" finishes the session; "Cancel session" removes it.
 */
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts } from '@/theme';
import type { SleepEvent } from '../domain/types';
import { formatElapsedTime } from '../timer/sessionMath';
import { useElapsedTime } from '../timer/useElapsedTime';

interface Props {
  event: SleepEvent;
  accentColor: string;
  onFinish: () => void;
  onCancel: () => void;
}

export function SleepActive({ event, accentColor, onFinish, onCancel }: Props) {
  const elapsedMs = useElapsedTime(event.startedAt, true);

  const startLabel = event.startedAt
    ? new Date(event.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

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
          Started {startLabel}
        </Text>
      </View>

      {/* Finish */}
      <View style={{ alignItems: 'center' }}>
        <PrimaryActionButton label="Baby woke up" accentColor={accentColor} onPress={onFinish} />
      </View>

      {/* Cancel — destructive, visually separated */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel sleep session"
        onPress={onCancel}
        style={{ alignItems: 'center', paddingVertical: 4 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}>
          Cancel session
        </Text>
      </Pressable>
    </View>
  );
}
