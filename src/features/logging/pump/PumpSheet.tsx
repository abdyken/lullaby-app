/**
 * Logging v2 — Pump bottom sheet (plan §7.2 LoggingSheet, Phase 7).
 *
 * One container, three bodies that follow the pump state machine
 * (`idle → running → volumeDraft → completed`):
 *   - idle: pick a side and start the timer;
 *   - active: the live timer + "Finish pumping";
 *   - volume draft: enter the optional volume and save (or save without it).
 *
 * The volume draft takes priority when present so a finished-but-unsaved pump
 * always reopens on the volume step — even after the sheet was closed or the app
 * restarted (the draft is derived from the persisted active+endedAt event, plan
 * Phase 7.2). Pump is the caregiver's session (plan §4.4); all business logic
 * lives in the use-cases behind `useLogging()`. Built on RN's Modal in the
 * existing design language, mirroring `SleepSheet`/`FeedSheet`.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows } from '@/theme';

import { isPumpEvent, type PumpEvent, type PumpSide } from '../domain/types';
import { useLogging } from '../state/LoggingProvider';
import { pumpTotalVolumeMl } from '../state/loggingSelectors';
import { elapsedMs, formatCompactDuration } from '../timer/sessionMath';
import { confirmDiscardSession } from '../ui/confirmDiscardSession';
import { PumpActive } from './PumpActive';
import { PumpIdle } from './PumpIdle';
import { PumpVolumeDraft } from './PumpVolumeDraft';

type Props = {
  onClose: () => void;
};

function sideLabel(side: PumpSide): string {
  return side === 'both' ? 'Both' : side === 'left' ? 'Left' : 'Right';
}

function clockLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function agoLabel(iso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m ago`;
  }
  return `${mins}m ago`;
}

function pumpSummary(event: PumpEvent, now: number): string {
  const total = pumpTotalVolumeMl(event.details);
  if (total > 0) return `${total} ml`;
  return formatCompactDuration(elapsedMs(event.startedAt ?? event.occurredAt, event.endedAt, now));
}

export function PumpSheet({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [openedAt] = useState(() => Date.now());
  const {
    todayEvents,
    activePump,
    pumpVolumeDraft,
    error,
    clearError,
    startPump,
    finishPump,
    savePump,
    cancelPump,
  } = useLogging();

  const accentColor = colors.pump;
  const accentTint = colors.pumpTint;

  const handleClose = () => {
    clearError();
    onClose();
  };

  // Finishing the timer does NOT close the sheet — it moves to the volume draft.
  const handleFinish = () => {
    void finishPump();
  };

  // Cancel discards an in-progress pump with no Undo, so confirm first (plan §10).
  // (Cancel is offered while the timer runs; a finished pump shows the volume draft.)
  const handleCancel = () =>
    confirmDiscardSession('pump session', () => {
      void cancelPump().then(handleClose);
    });

  const handleSave = async (leftVolumeMl: number | null, rightVolumeMl: number | null) => {
    const ok = await savePump({ leftVolumeMl, rightVolumeMl });
    if (ok) handleClose();
    return ok;
  };

  const handleSaveWithoutVolume = async () => {
    const ok = await savePump({ leftVolumeMl: null, rightVolumeMl: null });
    if (ok) handleClose();
    return ok;
  };

  // Draft first (a finished pump must reopen on its volume step), then a running
  // timer, otherwise idle.
  const mode = pumpVolumeDraft ? 'draft' : activePump ? 'active' : 'idle';
  const lastPump = useMemo(
    () =>
      [...todayEvents]
        .filter((event): event is PumpEvent => isPumpEvent(event) && event.status === 'completed')
        .sort((a, b) => Date.parse(b.endedAt ?? b.occurredAt) - Date.parse(a.endedAt ?? a.occurredAt))[0],
    [todayEvents],
  );
  const title =
    mode === 'draft' ? 'Add pumped volume' : mode === 'active' ? 'Pumping in progress' : 'Start pumping';
  const subtitle =
    mode === 'draft' && pumpVolumeDraft
      ? `${sideLabel(pumpVolumeDraft.side)} · ${formatCompactDuration(
          elapsedMs(pumpVolumeDraft.startedAt, pumpVolumeDraft.endedAt, Date.parse(pumpVolumeDraft.endedAt)),
        )}`
      : mode === 'active' && activePump?.startedAt
        ? `Started ${clockLabel(activePump.startedAt)} · ${sideLabel(activePump.details.side)}`
        : lastPump
          ? `Last pump ${agoLabel(lastPump.endedAt ?? lastPump.occurredAt, openedAt)} · ${pumpSummary(lastPump, openedAt)}`
          : 'No pump logged yet';

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

          {mode === 'draft' && pumpVolumeDraft ? (
            <PumpVolumeDraft
              draft={pumpVolumeDraft}
              accentColor={accentColor}
              onSave={handleSave}
              onSaveWithoutVolume={handleSaveWithoutVolume}
            />
          ) : mode === 'active' && activePump ? (
            <PumpActive
              event={activePump}
              accentColor={accentColor}
              onFinish={handleFinish}
              onCancel={handleCancel}
            />
          ) : (
            <PumpIdle accentColor={accentColor} accentTint={accentTint} onStart={(side) => void startPump(side)} />
          )}
        </View>
      </View>
    </Modal>
  );
}

export default PumpSheet;
