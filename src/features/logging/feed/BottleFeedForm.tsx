/**
 * BottleFeedForm — amount presets, stepper, and milk type selector for a bottle feed.
 *
 * No keyboard required: presets cover common amounts; the stepper handles fine-tuning.
 * Remembers the last milk type in component state (future: persist as preference).
 * Save is disabled when amountMl === 0 to prevent accidental zero-volume saves.
 */
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii } from '@/theme';
import type { MilkType } from '../domain/types';

const AMOUNT_PRESETS = [60, 90, 120, 150];
const STEP = 10;

const MILK_TYPES: { key: MilkType; label: string }[] = [
  { key: 'breast_milk', label: 'Breast milk' },
  { key: 'formula', label: 'Formula' },
  { key: 'mixed', label: 'Mixed' },
];

interface Props {
  accentColor: string;
  accentTint: string;
  onSave: (amountMl: number, milkType: MilkType) => void;
}

export function BottleFeedForm({ accentColor, accentTint, onSave }: Props) {
  const [amount, setAmount] = useState(120);
  const [milkType, setMilkType] = useState<MilkType>('breast_milk');

  // Prevent double-save.
  const savingRef = useRef(false);
  const handleSave = () => {
    if (savingRef.current || amount <= 0) return;
    savingRef.current = true;
    onSave(amount, milkType);
    // No reset needed — sheet closes after save.
  };

  return (
    <View style={{ gap: 20 }}>
      {/* Presets */}
      <View>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginBottom: 10 }}>
          Amount
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {AMOUNT_PRESETS.map((preset) => {
            const active = amount === preset;
            return (
              <Pressable
                key={preset}
                accessibilityRole="button"
                accessibilityLabel={`${preset} ml`}
                accessibilityState={{ selected: active }}
                onPress={() => setAmount(preset)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radii.medium,
                  backgroundColor: active ? accentTint : colors.surfaceSoft,
                  borderWidth: 2,
                  borderColor: active ? accentColor : 'transparent',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}>
                <Text
                  style={{
                    fontFamily: fonts.bodyBold,
                    fontSize: 13,
                    color: active ? accentColor : colors.inkSoft,
                  }}>
                  {preset}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Stepper */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease by 10 ml"
          onPress={() => setAmount((a) => Math.max(0, a - STEP))}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: radii.medium,
            backgroundColor: colors.surfaceSoft,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 18, color: colors.inkSoft }}>−</Text>
        </Pressable>

        <Text
          style={{ fontFamily: fonts.display, fontSize: 22, color: colors.ink, minWidth: 80, textAlign: 'center' }}
          accessibilityLabel={`${amount} ml`}>
          {amount} ml
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase by 10 ml"
          onPress={() => setAmount((a) => a + STEP)}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: radii.medium,
            backgroundColor: colors.surfaceSoft,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 18, color: colors.inkSoft }}>+</Text>
        </Pressable>
      </View>

      {/* Milk type */}
      <View>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginBottom: 10 }}>
          Type
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {MILK_TYPES.map(({ key, label }) => {
            const active = milkType === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: active }}
                onPress={() => setMilkType(key)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radii.medium,
                  backgroundColor: active ? accentTint : colors.surfaceSoft,
                  borderWidth: 2,
                  borderColor: active ? accentColor : 'transparent',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}>
                <Text
                  style={{
                    fontFamily: fonts.bodyBold,
                    fontSize: 12,
                    color: active ? accentColor : colors.inkSoft,
                    textAlign: 'center',
                  }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Save */}
      <View style={{ alignItems: 'center' }}>
        <PrimaryActionButton
          label={amount > 0 ? `Save · ${amount} ml` : 'Enter an amount'}
          accentColor={amount > 0 ? accentColor : colors.inkFaint}
          onPress={handleSave}
        />
      </View>
    </View>
  );
}
