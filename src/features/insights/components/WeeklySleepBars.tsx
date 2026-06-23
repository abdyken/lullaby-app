import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, surfaces } from '@/theme';

export type WeeklySleepBarsProps = {
  days: {
    label: string;
    minutes: number;
  }[];
};

const BAR_HEIGHT = 80;

export function WeeklySleepBars({ days }: WeeklySleepBarsProps) {
  const { mode } = useTheme();
  const palette = surfaces[mode];
  const hasSleepData = days.some((day) => day.minutes > 0);
  const maxMinutes = Math.max(...days.map((day) => day.minutes), 1);
  const trackColor = mode === 'night' ? 'rgba(255,255,255,0.05)' : 'rgba(85,96,198,0.07)';
  const emptyFillColor = mode === 'night' ? 'rgba(255,255,255,0.08)' : 'rgba(85,96,198,0.12)';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9, height: 104 }}>
      {days.map((day) => {
        const fillHeight = hasSleepData
          ? Math.max(8, Math.round((day.minutes / maxMinutes) * BAR_HEIGHT))
          : 8;

        return (
          <View
            key={day.label}
            style={{
              flex: 1,
              minWidth: 0,
              height: '100%',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 7,
            }}>
            <View
              style={{
                width: '100%',
                maxWidth: 30,
                height: BAR_HEIGHT,
                justifyContent: 'flex-end',
                overflow: 'hidden',
                borderRadius: 9,
                backgroundColor: trackColor,
              }}>
              {hasSleepData ? (
                <LinearGradient
                  colors={[colors.sleep2, colors.sleep]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={{
                    height: fillHeight,
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                    borderBottomLeftRadius: 5,
                    borderBottomRightRadius: 5,
                  }}
                />
              ) : (
                <View
                  style={{
                    height: fillHeight,
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                    borderBottomLeftRadius: 5,
                    borderBottomRightRadius: 5,
                    backgroundColor: emptyFillColor,
                  }}
                />
              )}
            </View>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 10.5,
                lineHeight: 14,
                color: palette.inkFaint,
                textAlign: 'center',
                width: '100%',
              }}>
              {day.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default WeeklySleepBars;
