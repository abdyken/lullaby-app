/**
 * Logging v2 — Sleep start screen (plan Phase 6 idle UI).
 *
 * Two paths, no keyboard:
 *  - Start a live session now, or backdated ("started earlier") by a preset
 *    offset. The model accepts an arbitrary `startedAt`, so a real time picker
 *    can replace these presets later without changing business logic (plan 6.2).
 *  - Add an already-finished sleep from a duration preset — this logs a completed
 *    event immediately and does NOT start a timer (plan 6.4).
 *
 * The session is created on Start (by the use-case), not on selection. Mirrors
 * the side/preset idiom of the Feed flow (`ChoicePill` + `PrimaryActionButton`).
 */
import { useState } from 'react';
import { Pressable, Text, View, type TextStyle } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts } from '@/theme';

import { ChoicePill } from '../feed/ChoicePill';

type Props = {
  accentColor: string;
  accentTint: string;
  /** Start a sleep that began `minutesAgo` minutes before now (0 = now). */
  onStart: (minutesAgo: number) => void;
  /** Log an already-finished sleep of `minutesLong` ending now. Returns accepted. */
  onSaveCompleted: (minutesLong: number) => Promise<boolean>;
};

const START_OFFSETS: { minutesAgo: number; label: string; a11y: string }[] = [
  { minutesAgo: 0, label: 'Now', a11y: 'Start now' },
  { minutesAgo: 5, label: '5m ago', a11y: 'Started 5 minutes ago' },
  { minutesAgo: 15, label: '15m ago', a11y: 'Started 15 minutes ago' },
  { minutesAgo: 30, label: '30m ago', a11y: 'Started 30 minutes ago' },
];

const COMPLETED_PRESETS: { minutesLong: number; label: string }[] = [
  { minutesLong: 30, label: '30m' },
  { minutesLong: 60, label: '1h' },
  { minutesLong: 120, label: '2h' },
];

const EYEBROW: TextStyle = {
  fontFamily: fonts.bodyBold,
  fontSize: 11,
  letterSpacing: 1,
  color: colors.inkFaint,
  marginBottom: 8,
};

export function SleepIdle({ accentColor, accentTint, onStart, onSaveCompleted }: Props) {
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedMin, setCompletedMin] = useState(60);
  const [savingCompleted, setSavingCompleted] = useState(false);

  const handleSaveCompleted = async () => {
    if (savingCompleted) return;
    setSavingCompleted(true);
    const ok = await onSaveCompleted(completedMin);
    if (!ok) setSavingCompleted(false);
  };

  return (
    <View>
      <Text style={{ ...EYEBROW, marginTop: 16 }}>STARTED</Text>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {START_OFFSETS.map((offset) => (
          <ChoicePill
            key={offset.minutesAgo}
            label={offset.label}
            accessibilityLabel={offset.a11y}
            active={minutesAgo === offset.minutesAgo}
            accentColor={accentColor}
            accentTint={accentTint}
            onPress={() => setMinutesAgo(offset.minutesAgo)}
          />
        ))}
      </View>

      <View style={{ marginTop: 20, alignItems: 'center' }}>
        <PrimaryActionButton
          label="Start sleep"
          accentColor={accentColor}
          onPress={() => onStart(minutesAgo)}
        />
      </View>

      {/* Completed-sleep path (plan 6.4) — logs a finished sleep, no timer. */}
      <View style={{ height: 1, backgroundColor: colors.line, marginTop: 20 }} />
      {!showCompleted ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a completed sleep"
          onPress={() => setShowCompleted(true)}
          hitSlop={8}
          style={({ pressed }) => ({
            marginTop: 16,
            alignSelf: 'center',
            paddingVertical: 6,
            paddingHorizontal: 12,
            opacity: pressed ? 0.5 : 1,
          })}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: accentColor }}>
            Add a completed sleep
          </Text>
        </Pressable>
      ) : (
        <View style={{ marginTop: 16 }}>
          <Text style={EYEBROW}>HOW LONG</Text>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {COMPLETED_PRESETS.map((preset) => (
              <ChoicePill
                key={preset.minutesLong}
                label={preset.label}
                accessibilityLabel={`Completed sleep of ${preset.label}`}
                active={completedMin === preset.minutesLong}
                accentColor={accentColor}
                accentTint={accentTint}
                onPress={() => setCompletedMin(preset.minutesLong)}
              />
            ))}
          </View>
          <View style={{ marginTop: 18, alignItems: 'center', opacity: savingCompleted ? 0.45 : 1 }}>
            <PrimaryActionButton
              label="Save completed sleep"
              accentColor={accentColor}
              onPress={savingCompleted ? undefined : handleSaveCompleted}
            />
          </View>
        </View>
      )}
    </View>
  );
}

export default SleepIdle;
