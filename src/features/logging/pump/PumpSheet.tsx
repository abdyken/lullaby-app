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
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows } from '@/theme';
import { systemClock, type PumpSide, type PumpVolumeDraft } from '../domain/types';
import { useLoggingStore } from '../state/loggingStore';
import { buildStartPumpEvent } from '../application/startPump';
import { buildFinishPumpTimer } from '../application/finishPump';
import { buildSavePumpEvent, buildSavePumpWithoutVolume } from '../application/savePump';
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

  // ── Start pump ────────────────────────────────────────────────────────────
  const handleStart = async (side: PumpSide) => {
    if (store.activePump) return;
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
  };

  // ── Finish timer → enter volume draft ─────────────────────────────────────
  const handleFinishTimer = async () => {
    if (!store.activePump) return;
    const endedAt = systemClock.nowIso();
    const updated = buildFinishPumpTimer({ event: store.activePump, endedAt });
    // updateSession persists endedAt to storage AND keeps activePump in memory.
    // status stays 'active' so getActiveSessions() can restore this after restart.
    await store.updateSession(updated);
    // Initialize the volume draft so the PumpVolumeDraftView can render.
    store.setPumpVolumeDraft({
      eventId: updated.id,
      side: updated.details.side,
      leftVolumeMl: 0,
      rightVolumeMl: 0,
    });
  };

  // ── Cancel timer ──────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!store.activePump) return;
    await store.cancelSession(store.activePump.id);
    store.setPumpVolumeDraft(null);
    onClose();
  };

  // ── Save with volume ──────────────────────────────────────────────────────
  const handleSaveVolume = async (leftMl: number, rightMl: number) => {
    if (!store.activePump) return;
    const savedAt = systemClock.nowIso();
    const draft: PumpVolumeDraft = {
      eventId: store.activePump.id,
      side: store.activePump.details.side,
      leftVolumeMl: leftMl,
      rightVolumeMl: rightMl,
    };
    const completed = buildSavePumpEvent({ event: store.activePump, draft, savedAt });
    await store.finishSession(completed);
    store.setPumpVolumeDraft(null);
    onClose();
  };

  // ── Save without volume ───────────────────────────────────────────────────
  const handleSaveWithoutVolume = async () => {
    if (!store.activePump) return;
    const savedAt = systemClock.nowIso();
    const completed = buildSavePumpWithoutVolume({ event: store.activePump, savedAt });
    await store.finishSession(completed);
    store.setPumpVolumeDraft(null);
    onClose();
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
