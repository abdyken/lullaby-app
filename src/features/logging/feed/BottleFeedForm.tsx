/**
 * Logging v2 — Bottle feed form (plan Phase 3 UI).
 *
 * An instant quantity event, logged WITHOUT the keyboard: fixed volume presets,
 * a ±10 ml stepper, and a milk-type pick. The amount can't go below 0 and Save
 * is disabled at 0 (`validateBottleAmount` also enforces `> 0` in the use-case).
 * The last-used milk type + amount are remembered in-memory for the session
 * (plan Phase 3 "remember the latest milk type as a preference"); full
 * persistence can layer on later without changing this component.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii } from '@/theme';

import type { MilkType } from '../domain/types';
import { ChoicePill } from './ChoicePill';

const PRESETS_ML = [60, 90, 120, 150] as const;
const STEP_ML = 10;

const MILK_TYPES: { key: MilkType; label: string }[] = [
  { key: 'breast_milk', label: 'Breast milk' },
  { key: 'formula', label: 'Formula' },
  { key: 'mixed', label: 'Mixed' },
];

// In-memory session preference (resets on app restart). Seeds the form so a
// parent who always pours ~120 ml of formula doesn't re-pick every time.
let lastAmountMl = 120;
let lastMilkType: MilkType = 'breast_milk';

type Props = {
  accentColor: string;
  accentTint: string;
  /** Save the bottle. Resolves true when it was accepted (so the sheet can close). */
  onSave: (amountMl: number, milkType: MilkType) => Promise<boolean>;
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
          width: 52,
          height: 52,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radii.medium,
          backgroundColor: colors.surfaceSoft,
        }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 20, color: colors.inkSoft }}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function BottleFeedForm({ accentColor, accentTint, onSave }: Props) {
  const [amountMl, setAmountMl] = useState(lastAmountMl);
  const [milkType, setMilkType] = useState<MilkType>(lastMilkType);
  const [saving, setSaving] = useState(false);

  const canSave = amountMl > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await onSave(amountMl, milkType);
    if (ok) {
      lastAmountMl = amountMl;
      lastMilkType = milkType;
    } else {
      setSaving(false);
    }
  };

  return (
    <View>
      {/* Volume presets */}
      <View style={{ flexDirection: 'row', gap: 9, marginTop: 16 }}>
        {PRESETS_ML.map((preset) => (
          <ChoicePill
            key={preset}
            label={`${preset} ml`}
            active={amountMl === preset}
            accentColor={accentColor}
            accentTint={accentTint}
            onPress={() => setAmountMl(preset)}
          />
        ))}
      </View>

      {/* Stepper */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 14,
        }}>
        <StepButton
          label="–"
          accessibilityLabel="Decrease by 10 millilitres"
          onPress={() => setAmountMl((ml) => Math.max(0, ml - STEP_ML))}
        />
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.ink }}>{amountMl}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.inkFaint, marginTop: -2 }}>
            ml
          </Text>
        </View>
        <StepButton
          label="+"
          accessibilityLabel="Increase by 10 millilitres"
          onPress={() => setAmountMl((ml) => ml + STEP_ML)}
        />
      </View>

      {/* Milk type */}
      <View style={{ flexDirection: 'row', gap: 9, marginTop: 18 }}>
        {MILK_TYPES.map((m) => (
          <ChoicePill
            key={m.key}
            label={m.label}
            active={milkType === m.key}
            accentColor={accentColor}
            accentTint={accentTint}
            onPress={() => setMilkType(m.key)}
          />
        ))}
      </View>

      {/* Save */}
      <View style={{ marginTop: 20, alignItems: 'center', opacity: canSave ? 1 : 0.45 }}>
        <PrimaryActionButton
          label={`Save bottle · ${amountMl} ml`}
          accentColor={accentColor}
          onPress={canSave ? handleSave : undefined}
        />
      </View>
    </View>
  );
}

export default BottleFeedForm;
