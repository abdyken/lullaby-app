/**
 * Logging v2 — Sleep bottom sheet (plan §7.2 LoggingSheet, Phase 6).
 *
 * One container, two bodies: idle (start now / earlier / add completed) and the
 * active session (live timer + "Baby woke up"). When a sleep is already running
 * the sheet opens straight into the active view — the same session the Quick Log
 * card controls, so they share a single source of truth (plan 6.5). Wiring the
 * Hero to this same session is part of the timeline integration (task 09).
 *
 * Built on RN's Modal in the existing design language (cream surface, grab
 * handle, sleep accent), mirroring `FeedSheet`. All business logic lives in the
 * use-cases behind `useLogging()`; this only translates the preset choices into
 * the timestamps the use-cases accept.
 */
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows } from '@/theme';

import { useLogging } from '../state/LoggingProvider';
import { SleepActive } from './SleepActive';
import { SleepIdle } from './SleepIdle';

type Props = {
  onClose: () => void;
};

export function SleepSheet({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { activeSleep, error, clearError, startSleep, finishSleep, cancelSleep, saveCompletedSleep } =
    useLogging();

  const accentColor = colors.sleep;
  const accentTint = colors.sleepTint;

  const handleClose = () => {
    clearError();
    onClose();
  };

  const handleFinish = async () => {
    await finishSleep();
    handleClose();
  };

  const handleCancel = async () => {
    await cancelSleep();
    handleClose();
  };

  // The sheet expresses the intent (now / N minutes ago); the actual timestamp
  // is resolved here and passed to the use-case, which owns all validation.
  const handleStart = (minutesAgo: number) => {
    const startedAt =
      minutesAgo > 0 ? new Date(Date.now() - minutesAgo * 60_000).toISOString() : undefined;
    void startSleep(startedAt ? { startedAt } : {});
  };

  const handleSaveCompleted = async (minutesLong: number): Promise<boolean> => {
    const now = Date.now();
    const ok = await saveCompletedSleep({
      startedAt: new Date(now - minutesLong * 60_000).toISOString(),
      endedAt: new Date(now).toISOString(),
    });
    if (ok) handleClose();
    return ok;
  };

  const isActive = activeSleep !== null;
  const title = isActive ? 'Sleep in progress' : 'Log sleep';
  const subtitle = isActive
    ? 'We’ll keep the night quiet'
    : 'Start now, earlier, or add a finished sleep';

  return (
    <Modal transparent visible animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={handleClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(46,42,64,0.35)',
          }}
        />

        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radii.large,
            borderTopRightRadius: radii.large,
            paddingTop: 10,
            paddingHorizontal: 18,
            paddingBottom: insets.bottom + 18,
            ...shadows.soft,
          }}>
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.line,
              marginBottom: 14,
            }}
          />

          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink }}>{title}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginTop: 2 }}>
            {subtitle}
          </Text>

          {error && (
            <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: accentColor, marginTop: 8 }}>
              {error.message}
            </Text>
          )}

          {isActive ? (
            <SleepActive
              event={activeSleep}
              accentColor={accentColor}
              onFinish={handleFinish}
              onCancel={handleCancel}
            />
          ) : (
            <SleepIdle
              accentColor={accentColor}
              accentTint={accentTint}
              onStart={handleStart}
              onSaveCompleted={handleSaveCompleted}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

export default SleepSheet;
