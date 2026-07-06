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
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { caregiverDisplayName } from '@/data/currentState';
import { hapticSave } from '@/lib/haptics';
import { useAuth } from '@/state/AuthProvider';
import { colors, radii, shadows } from '@/theme';

import { useLogging } from '../state/LoggingProvider';
import { confirmDiscardSession } from '../ui/confirmDiscardSession';
import { SleepActive } from './SleepActive';
import { SleepIdle } from './SleepIdle';

type Props = {
  onClose: () => void;
};

export function SleepSheet({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { todayEvents, activeSleep, error, clearError, startSleep, finishSleep, cancelSleep, saveCompletedSleep } =
    useLogging();
  // Attribution for the active-sleep start line — resolved from the same
  // caregiver roster the timeline rows use (createdByUserId → displayName),
  // so a Dad / second-caregiver session isn't mislabeled "by Mom". Null when
  // the id can't be resolved (unknown / solo-local) → the suffix is dropped.
  const { caregivers } = useAuth();
  const startedByName =
    activeSleep !== null ? caregiverDisplayName(caregivers, activeSleep.createdByUserId) : null;

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

  // Cancel discards an in-progress sleep with no Undo, so confirm first (plan §10).
  const handleCancel = () =>
    confirmDiscardSession('sleep', () => {
      void cancelSleep().then(handleClose);
    });

  // The sheet expresses the intent (now / N minutes ago); the actual timestamp
  // is resolved here and passed to the use-case, which owns all validation.
  const handleStart = (minutesAgo: number) => {
    const startedAt =
      minutesAgo > 0 ? new Date(Date.now() - minutesAgo * 60_000).toISOString() : undefined;
    hapticSave();
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
  const lastCompletedSleepEndedAt =
    [...todayEvents]
      .filter((event) => event.type === 'sleep' && event.status === 'completed' && event.endedAt !== null)
      .sort((a, b) => Date.parse(b.endedAt ?? b.occurredAt) - Date.parse(a.endedAt ?? a.occurredAt))[0]
      ?.endedAt ?? null;

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

          {isActive ? (
            <SleepActive
              event={activeSleep}
              accentColor={accentColor}
              startedByName={startedByName}
              errorMessage={error?.message}
              onFinish={handleFinish}
              onCancel={handleCancel}
            />
          ) : (
            <SleepIdle
              accentColor={accentColor}
              accentTint={accentTint}
              errorMessage={error?.message}
              lastCompletedSleepEndedAt={lastCompletedSleepEndedAt}
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
