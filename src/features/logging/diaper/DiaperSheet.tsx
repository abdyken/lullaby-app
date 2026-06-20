/**
 * DiaperSheet — bottom sheet for the logging v2 Diaper quick-log flow.
 *
 * Shows four type buttons: Wet, Dirty, Both, Dry.
 * Tapping any button immediately saves the event and closes the sheet.
 * No separate Save button — two taps total: open sheet + choose type.
 *
 * Double-press protection: a saving ref blocks a second tap while the
 * async createEvent is in flight.
 */
import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows } from '@/theme';
import { systemClock } from '../domain/types';
import { useLoggingStore } from '../state/loggingStore';
import { buildSaveDiaperEvent } from '../application/saveDiaper';

type DiaperKind = 'wet' | 'dirty' | 'both' | 'dry';

const DIAPER_OPTIONS: { kind: DiaperKind; label: string; emoji: string }[] = [
  { kind: 'wet', label: 'Wet', emoji: '💧' },
  { kind: 'dirty', label: 'Dirty', emoji: '💩' },
  { kind: 'both', label: 'Mixed', emoji: '🔄' },
  { kind: 'dry', label: 'Dry', emoji: '✓' },
];

interface Props {
  familyId: string;
  childId: string;
  userId: string;
  onClose: () => void;
}

export function DiaperSheet({ familyId, childId, userId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const store = useLoggingStore();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (kind: DiaperKind) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const event = buildSaveDiaperEvent({
        familyId,
        childId,
        createdByUserId: userId,
        kind,
        occurredAt: systemClock.nowIso(),
      });
      await store.createEvent(event);
      onClose();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
            Diaper
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginTop: 2 }}>
            Just now
          </Text>

          {/* Type buttons */}
          <View style={{ marginTop: 20, gap: 10 }}>
            {DIAPER_OPTIONS.map(({ kind, label, emoji }) => (
              <Pressable
                key={kind}
                accessibilityRole="button"
                accessibilityLabel={`${label} diaper`}
                disabled={saving}
                onPress={() => void handleSelect(kind)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.diaperTint : colors.surfaceSoft,
                  borderRadius: radii.medium,
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  opacity: saving ? 0.6 : 1,
                })}>
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
                <Text
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 17,
                    color: colors.ink,
                    flex: 1,
                  }}>
                  {label}
                </Text>
                {saving && (
                  <ActivityIndicator size="small" color={colors.diaper} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
