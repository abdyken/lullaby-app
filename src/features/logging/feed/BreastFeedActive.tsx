/**
 * BreastFeedActive — shows the running breast-feed timer.
 *
 * Displays total elapsed time plus per-side totals. Left/Right buttons let the
 * caregiver switch the active side. Finish ends the session; Cancel removes it
 * without creating a completed event.
 */
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii } from '@/theme';
import type { BreastFeedEvent } from '../domain/types';
import { calcBreastSegmentTotals, formatElapsedHuman, formatElapsedTime } from '../timer/sessionMath';
import { useElapsedTime } from '../timer/useElapsedTime';

interface Props {
  event: BreastFeedEvent;
  accentColor: string;
  accentTint: string;
  onSwitchSide: (side: 'left' | 'right') => void;
  onFinish: () => void;
  onCancel: () => void;
}

export function BreastFeedActive({ event, accentColor, accentTint, onSwitchSide, onFinish, onCancel }: Props) {
  const totalMs = useElapsedTime(event.startedAt, true);
  const activeSide = event.details.activeSide;

  // Re-derive per-side totals on every render tick (totalMs changes once/sec).
  const { totalLeftMs, totalRightMs } = calcBreastSegmentTotals(event.details.segments);

  // Debounce side-switch to prevent double-tap creating two segments.
  const switchingRef = useRef(false);
  const handleSwitchSide = (side: 'left' | 'right') => {
    if (switchingRef.current || activeSide === side) return;
    switchingRef.current = true;
    onSwitchSide(side);
    setTimeout(() => {
      switchingRef.current = false;
    }, 600);
  };

  return (
    <View style={{ gap: 18 }}>
      {/* Timer display */}
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text
          style={{ fontFamily: fonts.display, fontSize: 36, color: colors.ink, letterSpacing: -1 }}
          accessibilityLiveRegion="off">
          {formatElapsedTime(totalMs)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}>
            Left {formatElapsedHuman(totalLeftMs)}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}>
            Right {formatElapsedHuman(totalRightMs)}
          </Text>
        </View>
      </View>

      {/* Side switch buttons */}
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {(['left', 'right'] as const).map((side) => {
          const active = activeSide === side;
          return (
            <Pressable
              key={side}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${side} breast`}
              accessibilityState={{ selected: active }}
              onPress={() => handleSwitchSide(side)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 52,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radii.medium,
                backgroundColor: active ? accentTint : colors.surfaceSoft,
                borderWidth: 2,
                borderColor: active ? accentColor : 'transparent',
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}>
              <Text
                style={{
                  fontFamily: fonts.bodyBold,
                  fontSize: 14,
                  color: active ? accentColor : colors.inkSoft,
                }}>
                {side.charAt(0).toUpperCase() + side.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Finish */}
      <View style={{ alignItems: 'center' }}>
        <PrimaryActionButton label="Finish feeding" accentColor={accentColor} onPress={onFinish} />
      </View>

      {/* Cancel — destructive, visually separated */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel feeding session"
        onPress={onCancel}
        style={{ alignItems: 'center', paddingVertical: 4 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}>
          Cancel session
        </Text>
      </Pressable>
    </View>
  );
}
