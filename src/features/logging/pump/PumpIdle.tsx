/**
 * PumpIdle — side selection + start for the pump logging flow.
 */
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii } from '@/theme';
import type { PumpSide } from '../domain/types';

interface Props {
  accentColor: string;
  accentTint: string;
  onStart: (side: PumpSide) => Promise<void>;
}

export function PumpIdle({ accentColor, accentTint, onStart }: Props) {
  const [side, setSide] = useState<PumpSide>('both');
  const startingRef = useRef(false);

  const handleStart = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      await onStart(side);
    } catch {
      startingRef.current = false;
    }
  };

  return (
    <View style={{ gap: 18 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint }}>
        Select side
      </Text>

      {/* Side selector */}
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {(['left', 'right', 'both'] as PumpSide[]).map((s) => {
          const active = side === s;
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={`${s} side`}
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

      <View style={{ alignItems: 'center' }}>
        <PrimaryActionButton label="Start pumping" accentColor={accentColor} onPress={handleStart} />
      </View>
    </View>
  );
}
