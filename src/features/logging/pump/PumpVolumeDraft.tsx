/**
 * Logging v2 — pumped-volume draft (plan Phase 7.3 volume draft).
 *
 * The step after a pump timer finishes: enter the (optional) per-side volume and
 * save, or "Save without volume" for a duration-only record. The inputs shown
 * depend on the pumped side — left only, right only, or both. The TOTAL is
 * derived here for the button label, never stored (plan §7.3); the save use-case
 * recomputes it from the per-side fields.
 *
 * Zero is allowed ONLY through "Save without volume" (plan §7.3): the primary
 * "Save pump · N ml" is disabled at a 0 total, and a side left at 0 is sent as
 * `null` ("not recorded"), never as 0. No keyboard — a ±5 ml stepper, mirroring
 * the Bottle form.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts } from '@/theme';

import type { PumpVolumeDraft as PumpVolumeDraftModel } from '../domain/types';
import { elapsedMs, formatCompactDuration } from '../timer/sessionMath';

const STEP_ML = 5;

type Props = {
  draft: PumpVolumeDraftModel;
  accentColor: string;
  /** Save with the entered volumes (a side at 0 is sent as null). Returns accepted. */
  onSave: (leftVolumeMl: number | null, rightVolumeMl: number | null) => Promise<boolean>;
  /** Save a duration-only record (both volumes null). Returns accepted. */
  onSaveWithoutVolume: () => Promise<boolean>;
};

function StepButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}>
      <View
        style={{
          width: 42,
          height: 42,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 14,
          backgroundColor: colors.surface,
          shadowColor: 'rgb(60,40,30)',
          shadowOpacity: 0.18,
          shadowRadius: 9,
          shadowOffset: { width: 0, height: 7 },
          elevation: 3,
        }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 22, color: colors.ink }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function VolumeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        gap: 8,
      }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.inkSoft, width: 72 }}>
        {label}
      </Text>
      <View
        style={{
          flex: 1,
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 18,
          backgroundColor: colors.surfaceSoft,
          padding: 5,
        }}>
        <StepButton
          label="–"
          accessibilityLabel={`Decrease ${label} by ${STEP_ML} millilitres`}
          onPress={() => onChange(Math.max(0, value - STEP_ML))}
        />
        <Text
          style={{
            minWidth: 88,
            textAlign: 'center',
            fontFamily: fonts.display,
            fontSize: 24,
            color: colors.ink,
            fontVariant: ['tabular-nums'],
          }}>
          {value}
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.inkSoft }}> ml</Text>
        </Text>
        <StepButton
          label="+"
          accessibilityLabel={`Increase ${label} by ${STEP_ML} millilitres`}
          onPress={() => onChange(value + STEP_ML)}
        />
      </View>
    </View>
  );
}

export function PumpVolumeDraft({ draft, accentColor, onSave, onSaveWithoutVolume }: Props) {
  const [left, setLeft] = useState(draft.leftVolumeMl ?? 0);
  const [right, setRight] = useState(draft.rightVolumeMl ?? 0);
  const [saving, setSaving] = useState(false);

  const showLeft = draft.side === 'left' || draft.side === 'both';
  const showRight = draft.side === 'right' || draft.side === 'both';

  // Only the visible side(s) contribute to the total.
  const total = (showLeft ? left : 0) + (showRight ? right : 0);
  const durationMs = elapsedMs(draft.startedAt, draft.endedAt, Date.parse(draft.endedAt));

  const canSaveVolume = total > 0 && !saving;

  // A side left at 0 (or not pumped) is "not recorded" → null, never 0.
  const toVolume = (visible: boolean, value: number): number | null =>
    visible && value > 0 ? value : null;

  const handleSave = async () => {
    if (!canSaveVolume) return;
    setSaving(true);
    const ok = await onSave(toVolume(showLeft, left), toVolume(showRight, right));
    if (!ok) setSaving(false);
  };

  const handleSaveWithout = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onSaveWithoutVolume();
    if (!ok) setSaving(false);
  };

  return (
    <View style={{ marginTop: 16 }}>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 11,
          letterSpacing: 1,
          color: colors.inkFaint,
          marginTop: 2,
          marginBottom: 2,
        }}>
        VOLUME
      </Text>

      {showLeft && <VolumeRow label="Left" value={left} onChange={setLeft} />}
      {showRight && <VolumeRow label="Right" value={right} onChange={setRight} />}

      <Text
        style={{
          marginTop: 12,
          textAlign: 'center',
          fontFamily: fonts.bodyBold,
          fontSize: 12,
          color: colors.inkFaint,
        }}>
        Pumped for {formatCompactDuration(durationMs)}
      </Text>

      <View style={{ marginTop: 20, alignItems: 'center', opacity: canSaveVolume ? 1 : 0.45 }}>
        <PrimaryActionButton
          label={`Save pump · ${total} ml`}
          accentColor={accentColor}
          onPress={canSaveVolume ? handleSave : undefined}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save pump without volume"
        onPress={handleSaveWithout}
        hitSlop={8}
        disabled={saving}
        style={({ pressed }) => ({
          marginTop: 12,
          alignSelf: 'center',
          paddingVertical: 8,
          paddingHorizontal: 14,
          opacity: pressed || saving ? 0.5 : 1,
        })}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: accentColor }}>
          Save without volume
        </Text>
      </Pressable>
    </View>
  );
}

export default PumpVolumeDraft;
