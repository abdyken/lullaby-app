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
import { useEffect, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { usePressScale } from '@/lib/usePressScale';
import { colors, fonts, radii } from '@/theme';

import type { SleepEvent } from '../domain/types';
import { elapsedMs, formatCompactDuration } from '../timer/sessionMath';

type Props = {
  event: SleepEvent;
  accentColor: string;
  /** Display name of who started the session (resolved by the sheet from the
   *  caregiver roster). Null → attribution unknown, so the suffix is dropped. */
  startedByName?: string | null;
  errorMessage?: string;
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

function FilledButton({
  label,
  accentColor,
  onPress,
}: {
  label: string;
  accentColor: string;
  onPress: () => void;
}) {
  // Settled scale-0.96 press-down; Reduce Motion ON → opacity 0.86 fallback.
  const press = usePressScale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={({ pressed }) => ({
        width: '100%',
        borderRadius: 20,
        opacity: !press.animate && pressed ? 0.86 : 1,
      })}>
      <Animated.View
        style={{
          width: '100%',
          minHeight: 52,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accentColor,
          borderRadius: 20,
          paddingVertical: 17,
          paddingHorizontal: 16,
          shadowColor: accentColor,
          shadowOpacity: 0.28,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 5,
          ...press.transformStyle,
        }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15.5, color: colors.white }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function SleepActive({ event, accentColor, startedByName, errorMessage, onFinish, onCancel }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const startedLabel = formatStartedAt(event.startedAt);
  // Display-only tick; the value is derived from `startedAt`, not stored.
  const elapsed = event.startedAt === null ? 0 : elapsedMs(event.startedAt, null, nowMs);

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, [event.startedAt]);

  return (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 23, color: colors.ink, textAlign: 'center' }}>
          Sleep in progress
        </Text>
        {startedLabel !== '' && (
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 13,
              color: colors.inkSoft,
              textAlign: 'center',
              marginTop: 3,
            }}>
            Started {startedLabel}
            {startedByName ? ` · by ${startedByName}` : ''}
          </Text>
        )}
        {errorMessage && (
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 12.5,
              color: accentColor,
              textAlign: 'center',
              marginTop: 8,
            }}>
            {errorMessage}
          </Text>
        )}
      </View>

      <View
        style={{
          backgroundColor: colors.surfaceSoft,
          borderRadius: radii.medium,
          paddingHorizontal: 18,
          paddingVertical: 19,
          alignItems: 'center',
          marginBottom: 18,
        }}>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 11,
            letterSpacing: 1,
            color: colors.inkFaint,
            textTransform: 'uppercase',
          }}>
          Asleep for
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: 40,
            color: colors.ink,
            fontVariant: ['tabular-nums'],
            lineHeight: 46,
            marginTop: 4,
          }}>
          {formatCompactDuration(elapsed)}
        </Text>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.inkSoft, marginTop: 4 }}>
          The timer continues after closing the app
        </Text>
      </View>

      <FilledButton label="Baby woke up" accentColor={accentColor} onPress={onFinish} />

      <View style={{ height: 24 }} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel sleep session"
        onPress={onCancel}
        hitSlop={8}
        style={({ pressed }) => ({
          alignSelf: 'center',
          paddingVertical: 10,
          paddingHorizontal: 14,
          opacity: pressed ? 0.5 : 1,
        })}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.inkSoft }}>
          Cancel this sleep
        </Text>
      </Pressable>
    </View>
  );
}

export default SleepActive;
