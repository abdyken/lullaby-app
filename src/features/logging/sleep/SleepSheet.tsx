/**
 * SleepSheet — bottom sheet for the logging v2 Sleep flow.
 *
 * Shows SleepActive when a session is running (allowing Finish or Cancel),
 * and SleepIdle otherwise (allowing Start now or Started 5 min ago).
 *
 * Closing the sheet while a session is active does NOT end the session —
 * the timer continues running and the sheet can be re-opened from the
 * Quick Log card.
 */
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows } from '@/theme';
import { systemClock } from '../domain/types';
import { useLoggingStore } from '../state/loggingStore';
import { buildStartSleepEvent } from '../application/startSleep';
import { buildFinishSleepEvent } from '../application/finishSleep';
import { makeId } from '../application/makeId';
import { SleepIdle } from './SleepIdle';
import { SleepActive } from './SleepActive';

const ACCENT = colors.sleep;
const TINT = colors.sleepTint;

interface Props {
  familyId: string;
  childId: string;
  userId: string;
  onClose: () => void;
}

export function SleepSheet({ familyId, childId, userId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const store = useLoggingStore();

  const isActive = store.activeSleep !== null;

  // ── Start sleep ────────────────────────────────────────────────────────────
  const handleStart = async (startedAt: string) => {
    if (store.activeSleep) return; // guard: session already running
    const event = buildStartSleepEvent({
      familyId,
      childId,
      createdByUserId: userId,
      startedAt,
    });
    await store.startSession(event);
  };

  // ── Finish sleep ───────────────────────────────────────────────────────────
  const handleFinish = async () => {
    if (!store.activeSleep) return;
    const snapshot = store.activeSleep;
    const finished = buildFinishSleepEvent({
      event: snapshot,
      endedAt: systemClock.nowIso(),
    });
    await store.finishSession(finished);
    store.setLastMutation({
      mutationId: makeId(),
      kind: 'finish',
      eventId: finished.id,
      previousSnapshot: snapshot,
      expiresAt: new Date(Date.now() + 10000).toISOString(),
      label: 'Sleep finished',
    });
    onClose();
  };

  // ── Cancel sleep ───────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!store.activeSleep) return;
    await store.cancelSession(store.activeSleep.id);
    onClose();
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Scrim */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
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
          {/* Grab handle */}
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

          {/* Title */}
          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink }}>
            {isActive ? 'Sleep in progress' : 'Sleep'}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginTop: 2 }}>
            {isActive ? 'Session running' : 'Just now'}
          </Text>

          {/* Body */}
          <View style={{ marginTop: 20 }}>
            {isActive && store.activeSleep ? (
              <SleepActive
                event={store.activeSleep}
                accentColor={ACCENT}
                onFinish={handleFinish}
                onCancel={handleCancel}
              />
            ) : (
              <SleepIdle
                accentColor={ACCENT}
                accentTint={TINT}
                onStart={handleStart}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
