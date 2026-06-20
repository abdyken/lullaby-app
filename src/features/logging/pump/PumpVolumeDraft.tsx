/**
 * PumpVolumeDraft — volume entry after stopping the pump timer.
 *
 * Shows only the inputs relevant to the selected side (left, right, or both).
 * Volume is optional — "Save without volume" creates a duration-only record.
 */
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii } from '@/theme';
import type { PumpVolumeDraft as PumpVolumeDraftModel } from '../domain/types';

interface StepperProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
}

function VolumeStepper({ label, value, onChange }: StepperProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
      <Text
        style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink, minWidth: 40 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label} volume`}
          onPress={() => onChange(Math.max(0, value - 5))}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radii.medium,
            backgroundColor: colors.surfaceSoft,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 20, color: colors.ink }}>−</Text>
        </Pressable>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 16,
            color: colors.ink,
            minWidth: 68,
            textAlign: 'center',
          }}>
          {value} ml
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label} volume`}
          onPress={() => onChange(value + 5)}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radii.medium,
            backgroundColor: colors.surfaceSoft,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 20, color: colors.ink }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface Props {
  draft: PumpVolumeDraftModel;
  accentColor: string;
  onSave: (leftMl: number, rightMl: number) => void;
  onSaveWithoutVolume: () => void;
}

export function PumpVolumeDraft({ draft, accentColor, onSave, onSaveWithoutVolume }: Props) {
  const side = draft.side;
  const [leftVol, setLeftVol] = useState(0);
  const [rightVol, setRightVol] = useState(0);
  const savingRef = useRef(false);

  const total =
    (side === 'left' || side === 'both' ? leftVol : 0) +
    (side === 'right' || side === 'both' ? rightVol : 0);

  const handleSave = () => {
    if (savingRef.current) return;
    if (total <= 0) return;
    savingRef.current = true;
    onSave(leftVol, rightVol);
  };

  const handleSaveWithout = () => {
    if (savingRef.current) return;
    savingRef.current = true;
    onSaveWithoutVolume();
  };

  const saveLabel = total > 0 ? `Save pump · ${total} ml` : 'Save pump';

  return (
    <View style={{ gap: 18 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}>
        Add pumped volume (optional)
      </Text>

      {(side === 'left' || side === 'both') && (
        <VolumeStepper label="Left" value={leftVol} onChange={setLeftVol} />
      )}
      {(side === 'right' || side === 'both') && (
        <VolumeStepper label="Right" value={rightVol} onChange={setRightVol} />
      )}

      <View style={{ alignItems: 'center' }}>
        <PrimaryActionButton
          label={saveLabel}
          accentColor={total > 0 ? accentColor : colors.inkFaint}
          onPress={total > 0 ? handleSave : undefined}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save pump without volume"
        onPress={handleSaveWithout}
        style={{ alignItems: 'center', paddingVertical: 4 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}>
          Save without volume
        </Text>
      </Pressable>
    </View>
  );
}
