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
 * for wake windows (the awake time between sleeps). Each glyph is drawn optically
 * centered on x=12 so the three read as an even, aligned set across the cards.
 */
function InsightGlyph({ icon, color }: { icon: InsightIcon; color: string }) {
  if (icon === 'bottle') {
    // A recognizable baby bottle: teat + collar ring + body + two measurement
    // ticks — symmetric about x=12 (the old single outline read like a vial).
    return (
      <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
        <Path
          d="M10.9 4.6V3.4a1.1 1.1 0 0 1 2.2 0v1.2"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M9 4.6h6v2.4H9z"
          stroke={color}
          strokeWidth={1.9}
          strokeLinejoin="round"
        />
        <Path
          d="M9.4 7v10.6a2.6 2.6 0 0 0 2.6 2.6h0a2.6 2.6 0 0 0 2.6-2.6V7"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M9.9 10.6h2.3M9.9 13.4h2.3"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
        />
      </Svg>
    );
  }
  if (icon === 'moon') {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
          d="M20.5 13A8.5 8.5 0 1 1 11 3.5 6.6 6.6 0 0 0 20.5 13Z"
          stroke={color}
          strokeWidth={1.9}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4.4} stroke={color} strokeWidth={1.9} />
      <Path
        d="M12 2.5v1.7M12 19.8v1.7M5.6 5.6l1.2 1.2M17.2 17.2l1.2 1.2M2.5 12h1.7M19.8 12h1.7M5.6 18.4l1.2-1.2M17.2 6.8l1.2-1.2"
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
        alignItems: 'center',
        gap: 13,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: radii.small,
        backgroundColor: mode === 'night' ? NIGHT_TINT[tone] : DAY_TINT[tone],
      }}>
      {/* Fixed 24×24 slot, centered on both axes, so the three glyphs sit even
          regardless of each one's internal extent (was horizontal-center only). */}
      <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
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
