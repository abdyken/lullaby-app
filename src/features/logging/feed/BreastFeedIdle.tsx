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
import { ChoicePill } from './ChoicePill';

type Props = {
  accentColor: string;
  accentTint: string;
  /** Default starting side (e.g. opposite of the last completed feed). */
  defaultSide?: BreastSide;
  onStart: (side: BreastSide) => void;
};

const SIDE_LABEL: Record<BreastSide, string> = { left: 'Left', right: 'Right' };

export function BreastFeedIdle({ accentColor, accentTint, defaultSide = 'left', onStart }: Props) {
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
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {(['left', 'right'] as const).map((s) => (
          <ChoicePill
            key={s}
            label={SIDE_LABEL[s]}
            accessibilityLabel={`Start on ${SIDE_LABEL[s].toLowerCase()} breast`}
            active={side === s}
            accentColor={accentColor}
            accentTint={accentTint}
            onPress={() => setSide(s)}
          />
        ))}
      </View>

      <View style={{ marginTop: 20, alignItems: 'center' }}>
        <PrimaryActionButton
          label={`Start ${SIDE_LABEL[side].toLowerCase()} side`}
          accentColor={accentColor}
          onPress={() => onStart(side)}
        />
      </View>
    </View>
  );
}

export default BreastFeedIdle;
