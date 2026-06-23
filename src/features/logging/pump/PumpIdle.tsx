/**
 * Logging v2 — Pump start screen (plan Phase 7.1 idle UI).
 *
 * Pick a side (Left / Right / Both), then start the timer. The session is created
 * on Start (by the use-case), not on selection. Both is the default — it is the
 * common case and matches the legacy pump card. Mirrors the preview's segmented
 * side selector while keeping the existing `PrimaryActionButton` action.
 */
import { useState } from 'react';
import { Text, View, type TextStyle } from 'react-native';

import { colors, fonts } from '@/theme';

import type { PumpSide } from '../domain/types';
import { FeedSegmentedControl, type FeedSegmentedOption } from '../feed/FeedSegmentedControl';
import { PumpActionStack } from './PumpActionStack';

type Props = {
  accentColor: string;
  onStart: (side: PumpSide) => void;
};

const SIDE_OPTIONS = [
  { value: 'left', label: 'Left', accessibilityLabel: 'Pump left side' },
  { value: 'right', label: 'Right', accessibilityLabel: 'Pump right side' },
  { value: 'both', label: 'Both', accessibilityLabel: 'Pump both sides' },
] as const satisfies readonly FeedSegmentedOption<PumpSide>[];

const EYEBROW: TextStyle = {
  fontFamily: fonts.bodyBold,
  fontSize: 11,
  letterSpacing: 1,
  color: colors.inkFaint,
  marginBottom: 8,
};

export function PumpIdle({ accentColor, onStart }: Props) {
  const [side, setSide] = useState<PumpSide>('both');

  return (
    <View>
      <Text style={{ ...EYEBROW, marginTop: 20 }}>SIDE</Text>
      <View style={{ width: '100%', alignSelf: 'stretch' }}>
        <FeedSegmentedControl value={side} options={SIDE_OPTIONS} onChange={setSide} />
      </View>

      <Text
        style={{
          marginTop: 16,
          marginHorizontal: 10,
          textAlign: 'center',
          fontFamily: fonts.bodyBold,
          fontSize: 12.5,
          lineHeight: 18,
          color: colors.inkSoft,
        }}>
        First track duration. Enter volume after finishing.
      </Text>

      <PumpActionStack
        primaryLabel="Start pumping"
        accentColor={accentColor}
        onPrimaryPress={() => onStart(side)}
        marginTop={18}
      />
    </View>
  );
}

export default PumpIdle;
