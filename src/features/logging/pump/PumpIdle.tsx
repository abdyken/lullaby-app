/**
 * Logging v2 — Pump start screen (plan Phase 7.1 idle UI).
 *
 * Pick a side (Left / Right / Both), then start the timer. The session is created
 * on Start (by the use-case), not on selection. Both is the default — it is the
 * common case and matches the legacy pump card. Mirrors the side/preset idiom of
 * the Feed/Sleep flows (`ChoicePill` + `PrimaryActionButton`).
 */
import { useState } from 'react';
import { Text, View, type TextStyle } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts } from '@/theme';

import type { PumpSide } from '../domain/types';
import { ChoicePill } from '../feed/ChoicePill';

type Props = {
  accentColor: string;
  accentTint: string;
  onStart: (side: PumpSide) => void;
};

const SIDES: { side: PumpSide; label: string; a11y: string }[] = [
  { side: 'left', label: 'Left', a11y: 'Pump left side' },
  { side: 'right', label: 'Right', a11y: 'Pump right side' },
  { side: 'both', label: 'Both', a11y: 'Pump both sides' },
];

const EYEBROW: TextStyle = {
  fontFamily: fonts.bodyBold,
  fontSize: 11,
  letterSpacing: 1,
  color: colors.inkFaint,
  marginBottom: 8,
};

export function PumpIdle({ accentColor, accentTint, onStart }: Props) {
  const [side, setSide] = useState<PumpSide>('both');

  return (
    <View>
      <Text style={{ ...EYEBROW, marginTop: 16 }}>SIDE</Text>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {SIDES.map((option) => (
          <ChoicePill
            key={option.side}
            label={option.label}
            accessibilityLabel={option.a11y}
            active={side === option.side}
            accentColor={accentColor}
            accentTint={accentTint}
            onPress={() => setSide(option.side)}
          />
        ))}
      </View>

      <View style={{ marginTop: 20, alignItems: 'center' }}>
        <PrimaryActionButton label="Start pumping" accentColor={accentColor} onPress={() => onStart(side)} />
      </View>
    </View>
  );
}

export default PumpIdle;
