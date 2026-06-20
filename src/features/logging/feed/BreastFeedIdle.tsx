/**
 * BreastFeedIdle — side selection UI shown when no active breast-feed session exists.
 *
 * User picks Left or Right, then taps Start. The chosen side is pre-selected
 * as a visual hint, but the session is not created until Start is pressed.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii } from '@/theme';

interface Props {
  accentColor: string;
  accentTint: string;
  onStart: (side: 'left' | 'right') => void;
}

export function BreastFeedIdle({ accentColor, accentTint, onStart }: Props) {
  const [side, setSide] = useState<'left' | 'right'>('left');

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginBottom: 10 }}>
          Start on
        </Text>
        <View style={{ flexDirection: 'row', gap: 9 }}>
          {(['left', 'right'] as const).map((s) => {
            const active = side === s;
            return (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityLabel={`Start ${s} breast`}
                accessibilityState={{ selected: active }}
                onPress={() => setSide(s)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 52,
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
                    fontSize: 14,
                    color: active ? accentColor : colors.inkSoft,
                  }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ alignItems: 'center' }}>
        <PrimaryActionButton
          label={`Start ${side.charAt(0).toUpperCase() + side.slice(1)}`}
          accentColor={accentColor}
          onPress={() => onStart(side)}
        />
      </View>
    </View>
  );
}
