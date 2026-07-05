/**
 * Logging v2 — Breastfeeding start screen (plan Phase 5.1 UI).
 *
 * Pick the starting side, then Start. Starting the session writes an active
 * event BEFORE any timer shows (the use-case), so the running session survives a
 * force-close immediately after Start. The session is created on Start, not on
 * side selection.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts } from '@/theme';

import type { BreastSide } from '../domain/types';
import { FeedSegmentedControl, type FeedSegmentedOption } from './FeedSegmentedControl';

type Props = {
  accentColor: string;
  /** Default starting side (e.g. opposite of the last completed feed). */
  defaultSide?: BreastSide;
  onStart: (side: BreastSide) => void;
};

const SIDE_LABEL: Record<BreastSide, string> = { left: 'Left', right: 'Right' };
const SIDE_OPTIONS: FeedSegmentedOption<BreastSide>[] = [
  { value: 'left', label: SIDE_LABEL.left, accessibilityLabel: 'Start on left breast' },
  { value: 'right', label: SIDE_LABEL.right, accessibilityLabel: 'Start on right breast' },
];

export function BreastFeedIdle({ accentColor, defaultSide = 'left', onStart }: Props) {
  const [side, setSide] = useState<BreastSide>(defaultSide);

  return (
    <View>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 11,
          letterSpacing: 1,
          color: colors.inkFaint,
          marginTop: 16,
          marginBottom: 8,
        }}>
        START ON
      </Text>
      <View style={{ width: '100%', alignSelf: 'stretch' }}>
        <FeedSegmentedControl value={side} options={SIDE_OPTIONS} onChange={setSide} />
      </View>

      <View style={{ marginTop: 20, alignItems: 'center' }}>
        <PrimaryActionButton
          label={`Start ${SIDE_LABEL[side].toLowerCase()} side`}
          accentColor={accentColor}
          pressOpacity={0.86}
          onPress={() => onStart(side)}
        />
      </View>
    </View>
  );
}

export default BreastFeedIdle;
