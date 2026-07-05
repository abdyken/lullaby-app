import type * as React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { InsightIcon } from '@/features/insights/types';
import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, surfaces } from '@/theme';

export type InsightCardProps = {
  icon: InsightIcon;
  text: React.ReactNode;
  /** Quiet helper line under the body; rendered as plain text, never a link. */
  source?: string;
  tone?: 'feed' | 'sleep' | 'diaper' | 'growth' | 'neutral';
};

const DAY_TINT = {
  feed: colors.feedTint,
  sleep: colors.sleepTint,
  diaper: colors.diaperTint,
  growth: colors.pumpTint,
  neutral: colors.surfaceSoft,
} as const;

const NIGHT_TINT = {
  feed: 'rgba(255,122,61,0.13)',
  sleep: 'rgba(85,96,198,0.17)',
  diaper: 'rgba(35,183,158,0.14)',
  growth: 'rgba(255,177,46,0.14)',
  neutral: 'rgba(255,255,255,0.05)',
} as const;

// The glyph is tinted with the card's accent so it reads the same on iOS and
// Android (emoji don't tint and vary per platform).
const ICON_COLOR = {
  feed: colors.feed,
  sleep: colors.sleep2,
  diaper: colors.diaper,
  growth: colors.pump,
  neutral: colors.feed,
} as const;

/**
 * In-house line glyphs matching the app's icon style (24 viewBox, ~1.9 stroke,
 * rounded joins, single passed-in color). bottle = feed, moon = sleep, and a sun
 * for wake windows (the awake time between sleeps).
 */
function InsightGlyph({ icon, color }: { icon: InsightIcon; color: string }) {
  if (icon === 'bottle') {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
          d="M9 2h6M10 2v3.5a4 4 0 0 0-1.2 2.8L8 19a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3l-.8-10.7A4 4 0 0 0 14 5.5V2"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (icon === 'moon') {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
          d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
          stroke={color}
          strokeWidth={1.9}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4.6} stroke={color} strokeWidth={1.9} />
      <Path
        d="M12 2v1.7M12 20.3V22M5 5l1.2 1.2M17.8 17.8l1.2 1.2M2 12h1.7M20.3 12H22M5 19l1.2-1.2M17.8 6.2l1.2-1.2"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function InsightCard({ icon, text, source, tone = 'neutral' }: InsightCardProps) {
  const { mode } = useTheme();
  const palette = surfaces[mode];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 13,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: radii.small,
        backgroundColor: mode === 'night' ? NIGHT_TINT[tone] : DAY_TINT[tone],
      }}>
      <View style={{ width: 28, alignItems: 'center', marginTop: 1 }}>
        <InsightGlyph icon={icon} color={ICON_COLOR[tone]} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 13.5,
            lineHeight: 19.5,
            color: palette.ink,
          }}>
          {text}
        </Text>
        {source ? (
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: palette.inkSoft, marginTop: 6 }}>
            {source}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default InsightCard;
