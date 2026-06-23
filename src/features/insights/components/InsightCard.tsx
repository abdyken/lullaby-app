import type * as React from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, surfaces } from '@/theme';

export type InsightCardProps = {
  emoji: string;
  text: React.ReactNode;
  source?: string;
  sourceTone?: 'accent' | 'muted';
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

const SOURCE_COLOR = {
  feed: colors.feed,
  sleep: colors.sleep2,
  diaper: colors.diaper,
  growth: colors.pump,
  neutral: colors.feed,
} as const;

function SourceIcon({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function InsightCard({ emoji, text, source, sourceTone = 'accent', tone = 'neutral' }: InsightCardProps) {
  const { mode } = useTheme();
  const palette = surfaces[mode];
  const sourceColor = sourceTone === 'muted' ? palette.inkSoft : SOURCE_COLOR[tone];

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
      <Text style={{ width: 28, fontSize: 24, lineHeight: 26, textAlign: 'center', marginTop: 1 }}>{emoji}</Text>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <SourceIcon color={sourceColor} />
            <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 11, color: sourceColor }}>
              {source}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default InsightCard;
