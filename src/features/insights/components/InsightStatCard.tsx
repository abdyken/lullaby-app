import { Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, shadows, surfaces } from '@/theme';

export type InsightStatCardProps = {
  value: string;
  unit?: string;
  label: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
};

const DELTA_COLOR = {
  up: colors.diaper,
  down: colors.feed,
  neutral: colors.sleep,
} as const;

export function InsightStatCard({
  value,
  unit,
  label,
  delta,
  deltaTone = 'neutral',
}: InsightStatCardProps) {
  const { mode } = useTheme();
  const palette = surfaces[mode];

  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: palette.card,
        borderRadius: radii.small,
        borderWidth: mode === 'night' ? 1 : 0,
        borderColor: palette.border,
        minHeight: 104,
        padding: 15,
        ...shadows.card,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', minWidth: 0 }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          style={{
            fontFamily: fonts.display,
            fontSize: 26,
            lineHeight: 29,
            color: palette.ink,
            includeFontPadding: false,
          }}>
          {value}
        </Text>
        {unit ? (
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 19, color: palette.inkSoft }}>
            {unit}
          </Text>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.76}
        style={{
          fontFamily: fonts.body,
          fontSize: 11.5,
          lineHeight: 15,
          color: palette.inkSoft,
          marginTop: 5,
        }}>
        {label}
      </Text>
      {delta ? (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 11,
            color: DELTA_COLOR[deltaTone],
            marginTop: 7,
          }}>
          {delta}
        </Text>
      ) : null}
    </View>
  );
}

export default InsightStatCard;
