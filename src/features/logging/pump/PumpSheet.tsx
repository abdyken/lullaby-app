/**
 * PumpSheet — bottom sheet for the logging v2 Pump flow.
 *
 * State machine:
 *   idle → running (timer) → volume draft → completed
 *          running → cancelled
 *          volume draft → completed without volume
 *
 * Design notes:
 * - Closing the sheet while the timer is running does NOT end the session.
 * - After the timer stops, the event keeps status='active' with endedAt set.
 *   getActiveSessions() will restore this state after an app restart.
 * - Volume entry is optional — the user can save duration only.
 * - activePump.endedAt !== null signals the "volume draft" state (timer done,
 *   waiting for volume input or explicit "save without volume").
 */
import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows } from '@/theme';
import { systemClock, type PumpSide, type PumpVolumeDraft } from '../domain/types';
import { useLoggingStore } from '../state/loggingStore';
import { buildStartPumpEvent } from '../application/startPump';
import { buildFinishPumpTimer } from '../application/finishPump';
import { buildSavePumpEvent, buildSavePumpWithoutVolume } from '../application/savePump';
import { makeId } from '../application/makeId';
import { PumpIdle } from './PumpIdle';
import { PumpActive } from './PumpActive';
import { PumpVolumeDraft as PumpVolumeDraftView } from './PumpVolumeDraft';

const ACCENT = colors.pump;
const TINT = colors.pumpTint;

interface Props {
  familyId: string;
  childId: string | null;
  userId: string;
  onClose: () => void;
}

export function PumpSheet({ familyId, childId, userId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const store = useLoggingStore();

  // Derive UI state from the store —
  // timer running: session is active with no endedAt
  // volume draft:  session has been stopped (endedAt set) but not completed
  const isTimerRunning = store.activePump !== null && store.activePump.endedAt === null;
  const isVolumeDraft = store.activePump !== null && store.activePump.endedAt !== null;

  // Derive a usable draft object for PumpVolumeDraftView.
  // If the store has a pumpVolumeDraft (from this session), use it.
  // Otherwise synthesize one from activePump (covers app-restart recovery).
  const effectiveDraft: PumpVolumeDraft | null =
    store.pumpVolumeDraft ??
    (isVolumeDraft && store.activePump
      ? {
          eventId: store.activePump.id,
          side: store.activePump.details.side,
          leftVolumeMl: 0,
          rightVolumeMl: 0,
        }
      : null);

  let title = 'Pump';
  let subtitle = 'Just now';
  if (isTimerRunning) {
    title = 'Pumping in progress';
    subtitle = 'Session running';
  } else if (isVolumeDraft) {
    title = 'Add volume';
    subtitle = 'Session complete — add your output';
  }

  const [error, setError] = useState<string | null>(null);

  // Double-press guard for timer-stop (PumpActive has no built-in debounce).
  const finishingRef = useRef(false);

  // ── Start pump ────────────────────────────────────────────────────────────
  // PumpIdle has its own startingRef guard; error handling is needed here.
  const handleStart = async (side: PumpSide) => {
    if (store.activePump) return;
    setError(null);
    try {
      const startedAt = systemClock.nowIso();
      const event = buildStartPumpEvent({
        familyId,
        childId,
        createdByUserId: userId,
        subjectUserId: userId,
        side,
        startedAt,
      });
      await store.startSession(event);
    } catch {
      setError('Could not start pumping. Please try again.');
    }
  };

  // ── Finish timer → enter volume draft ─────────────────────────────────────
  const handleFinishTimer = async () => {
    if (!store.activePump) return;
    if (finishingRef.current) return;
    finishingRef.current = true;
    setError(null);
    try {
      const endedAt = systemClock.nowIso();
      const updated = buildFinishPumpTimer({ event: store.activePump, endedAt });
      await store.updateSession(updated);
      store.setPumpVolumeDraft({
        eventId: updated.id,
        side: updated.details.side,
        leftVolumeMl: 0,
        rightVolumeMl: 0,
      });
    } catch {
      setError('Could not stop timer. Please try again.');
      finishingRef.current = false;
    }
  };

  // ── Cancel timer ──────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!store.activePump) return;
    setError(null);
    try {
      await store.cancelSession(store.activePump.id);
      store.setPumpVolumeDraft(null);
      onClose();
    } catch {
      setError('Could not cancel session. Please try again.');
    }
  };

  // ── Save with volume ──────────────────────────────────────────────────────
  // PumpVolumeDraft has its own savingRef guard; error handling is needed here.
  const handleSaveVolume = async (leftMl: number, rightMl: number) => {
    if (!store.activePump) return;
    setError(null);
    try {
      const snapshot = store.activePump;
      const savedAt = systemClock.nowIso();
      const draft: PumpVolumeDraft = {
        eventId: snapshot.id,
        side: snapshot.details.side,
        leftVolumeMl: leftMl,
        rightVolumeMl: rightMl,
      };
      const completed = buildSavePumpEvent({ event: snapshot, draft, savedAt });
      await store.finishSession(completed);
      store.setPumpVolumeDraft(null);
      const totalMl = leftMl + rightMl;
      store.setLastMutation({
        mutationId: makeId(),
        kind: 'finish',
        eventId: completed.id,
        previousSnapshot: snapshot,
        expiresAt: new Date(Date.now() + 10000).toISOString(),
        label: `Pump · ${totalMl} ml saved`,
      });
      onClose();
    } catch {
      setError('Could not save pump volume. Please try again.');
    }
  };

  // ── Save without volume ───────────────────────────────────────────────────
  const handleSaveWithoutVolume = async () => {
    if (!store.activePump) return;
    setError(null);
    try {
      const snapshot = store.activePump;
      const savedAt = systemClock.nowIso();
      const completed = buildSavePumpWithoutVolume({ event: snapshot, savedAt });
      await store.finishSession(completed);
      store.setPumpVolumeDraft(null);
      store.setLastMutation({
        mutationId: makeId(),
        kind: 'finish',
        eventId: completed.id,
        previousSnapshot: snapshot,
        expiresAt: new Date(Date.now() + 10000).toISOString(),
        label: 'Pump saved',
      });
      onClose();
    } catch {
      setError('Could not save pump. Please try again.');
    }
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Scrim — tapping it closes the sheet but does NOT end an active session */}
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
            {title}
          </Text>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 13,
              color: colors.inkFaint,
              marginTop: 2,
            }}>
            {subtitle}
          </Text>
          {error && (
            <Text style={{ fontFamily: fonts.body, fontSize: 12, color: '#E04040', marginTop: 4 }}>
              {error}
            </Text>
          )}

          {/* Body */}
          <View style={{ marginTop: 20 }}>
            {isTimerRunning && store.activePump ? (
              <PumpActive
                event={store.activePump}
                accentColor={ACCENT}
                onFinish={handleFinishTimer}
                onCancel={handleCancel}
              />
            ) : isVolumeDraft && effectiveDraft ? (
              <PumpVolumeDraftView
                draft={effectiveDraft}
                accentColor={ACCENT}
                onSave={handleSaveVolume}
                onSaveWithoutVolume={handleSaveWithoutVolume}
              />
            ) : (
              <PumpIdle accentColor={ACCENT} accentTint={TINT} onStart={handleStart} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
