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
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows } from '@/theme';

import { useLogging } from '../state/LoggingProvider';
import { confirmDiscardSession } from '../ui/confirmDiscardSession';
import { PumpActive } from './PumpActive';
import { PumpIdle } from './PumpIdle';
import { PumpVolumeDraft } from './PumpVolumeDraft';

type Props = {
  onClose: () => void;
};

export function PumpSheet({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const {
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
  const title =
    mode === 'draft' ? 'Add pumped volume' : mode === 'active' ? 'Pumping in progress' : 'Log a pump';
  const subtitle =
    mode === 'draft'
      ? 'Add how much you pumped, or skip it'
      : mode === 'active'
        ? 'We’ll keep the time for you'
        : 'Pick a side and start the timer';

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
