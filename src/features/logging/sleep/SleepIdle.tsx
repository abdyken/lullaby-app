/**
 * SleepIdle — shown when no active sleep session exists.
 *
 * Two start options: "Start now" (immediate) and "Started 5 min ago"
 * (backdated). The model accepts an arbitrary startedAt so a full time-picker
 * can be added later without changing business logic.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii } from '@/theme';

type StartOption = 'now' | 'earlier';

interface Props {
  accentColor: string;
  accentTint: string;
  onStart: (startedAt: string) => void;
}

export function SleepIdle({ accentColor, accentTint, onStart }: Props) {
  const [option, setOption] = useState<StartOption>('now');

  const handleStart = () => {
    if (option === 'now') {
      onStart(new Date().toISOString());
    } else {
      // Started 5 minutes ago.
      onStart(new Date(Date.now() - 5 * 60 * 1000).toISOString());
    }
  };

  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {([
          { key: 'now', label: 'Start now' },
          { key: 'earlier', label: '5 min ago' },
        ] as { key: StartOption; label: string }[]).map(({ key, label }) => {
          const active = option === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              onPress={() => setOption(key)}
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
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ alignItems: 'center' }}>
        <PrimaryActionButton
          label="Start sleep"
          accentColor={accentColor}
          onPress={handleStart}
        />
      </View>
    </View>
  );
}
