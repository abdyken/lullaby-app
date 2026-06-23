import type * as React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, shadows, surfaces } from '@/theme';

export type InsightsSectionCardProps = {
  title: string;
  actionLabel?: string;
  children: React.ReactNode;
};

export function InsightsSectionCard({ title, actionLabel, children }: InsightsSectionCardProps) {
  const { mode } = useTheme();
  const palette = surfaces[mode];

  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderRadius: radii.medium,
        borderWidth: mode === 'night' ? 1 : 0,
        borderColor: palette.border,
        padding: 18,
        ...shadows.card,
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
        }}>
        <Text style={{ flex: 1, fontFamily: fonts.displayMedium, fontSize: 16, color: palette.ink }}>
          {title}
        </Text>
        {actionLabel ? (
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.feed }}>{actionLabel}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export default InsightsSectionCard;
