/**
 * Logging v2 — Diaper bottom sheet (plan §7.2 LoggingSheet, Phase 2).
 *
 * The simplest, fastest flow: four kind buttons (Wet / Dirty / Both / Dry) that
 * each save instantly and close the sheet — no intermediate selection, no Save
 * button — so a wet diaper is two taps: Diaper → Wet (plan Phase 2 acceptance).
 * `dry` is included, closing the audit gap where the legacy diaper had no "dry"
 * and took three taps.
 *
 * Built on RN's Modal in the existing design language (cream surface, grab
 * handle, diaper accent), mirroring `FeedSheet`/`SleepSheet`. All business logic
 * lives in the `saveDiaper` use-case behind `useLogging()`; this only maps a tap
 * to a kind. The toast + Undo that follow a save are wired with the shared Undo
 * (task 10); for now a successful save closes the sheet and the timeline picks
 * the event up via the v2 store.
 */
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows } from '@/theme';

import type { DiaperKind } from '../domain/types';
import { useLogging } from '../state/LoggingProvider';
import { DiaperTypeButton } from './DiaperTypeButton';

type Props = {
  onClose: () => void;
};

/** Order + copy mirror the reference: the two common kinds first, then Both, Dry. */
const KINDS: { kind: DiaperKind; label: string; hint: string }[] = [
  { kind: 'wet', label: 'Wet', hint: 'Tap to save' },
  { kind: 'dirty', label: 'Dirty', hint: 'Tap to save' },
  { kind: 'both', label: 'Both', hint: 'Wet + dirty' },
  { kind: 'dry', label: 'Dry', hint: 'Checked, all dry' },
];

export function DiaperSheet({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { error, clearError, saveDiaper } = useLogging();

  // Local guard so a fast double-tap (even on a different kind) can't open two
  // saves before the first resolves; the provider lock + clientEventId dedupe
  // are the deeper backstops (plan Phase 2 — "double press does not duplicate").
  const [saving, setSaving] = useState(false);

  const accentColor = colors.diaper;
  const accentTint = colors.diaperTint;

  const handleClose = () => {
    clearError();
    onClose();
  };

  const handleSave = async (kind: DiaperKind) => {
    if (saving) return;
    setSaving(true);
    const ok = await saveDiaper(kind);
    if (ok) handleClose();
    // On failure keep the sheet open so the error line is visible and re-tappable.
    else setSaving(false);
  };

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

          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink }}>
            Log a diaper
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginTop: 2 }}>
            Choose one — it saves instantly
          </Text>

          {error && (
            <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: accentColor, marginTop: 8 }}>
              {error.message}
            </Text>
          )}

          <View style={{ gap: 10, marginTop: 16 }}>
            {KINDS.map((k) => (
              <DiaperTypeButton
                key={k.kind}
                kind={k.kind}
                label={k.label}
                hint={k.hint}
                accentColor={accentColor}
                accentTint={accentTint}
                disabled={saving}
                onPress={() => void handleSave(k.kind)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default DiaperSheet;
