/**
 * RecapCard — "Based on tonight's logs": code-computed tally pills over the
 * night window plus the short read. The tallies are ALWAYS computed locally in
 * code; the read text is the strictly descriptive recapReadText. (Phase 2 may
 * swap in an LLM-phrased read for Pro users — see application/nightRead.ts —
 * but the local text always renders first and remains the fallback.)
 */
import { Text, View } from 'react-native';

import type { ReassureNightRecap } from '@/features/reassure/domain/types';
import { recapReadText, recapWindowLabel } from '@/features/reassure/domain/recap';
import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

type Props = {
  surfaceMode: SurfaceMode;
  recap: ReassureNightRecap;
  /** Phase 2: the Pro LLM night read, when available. Falls back to the local text. */
  readOverride?: string | null;
};

type Tally = { text: string; color: string };

function buildTallies(recap: ReassureNightRecap): Tally[] {
  const tallies: Tally[] = [];
  if (recap.feedCount > 0) {
    tallies.push({ text: `${recap.feedCount} feed${recap.feedCount === 1 ? '' : 's'}`, color: colors.feed });
  }
  if (recap.diaperCount > 0) {
    tallies.push({
      text: `${recap.diaperCount} diaper${recap.diaperCount === 1 ? '' : 's'}`,
      color: colors.diaper,
    });
  }
  if (recap.sleepRunning) {
    tallies.push({ text: 'sleep running', color: colors.sleep });
  } else if (recap.longestSleepMin !== undefined) {
    tallies.push({ text: `${recap.longestSleepMin}-min sleep`, color: colors.sleep });
  }
  if (recap.spitUpCount > 0) {
    tallies.push({
      text: `${recap.spitUpCount} spit-up${recap.spitUpCount === 1 ? '' : 's'}`,
      color: colors.pump,
    });
  }
  return tallies;
}

export function RecapCard({ surfaceMode, recap, readOverride }: Props) {
  const palette = surfaces[surfaceMode];
  const night = surfaceMode === 'night';
  const tallies = buildTallies(recap);
  const readText = readOverride ?? recapReadText(recap);

  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderRadius: radii.medium,
        borderWidth: night ? 1 : 0,
        borderColor: palette.border,
        padding: 16,
        ...shadows.card,
      }}>
      {tallies.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {tallies.map((tally) => (
            <View
              key={tally.text}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                backgroundColor: night ? 'rgba(255,255,255,0.06)' : colors.surfaceSoft,
                borderRadius: radii.pill,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}>
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tally.color }}
              />
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: palette.ink }}>
                {tally.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 10.5,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: colors.sleep,
          marginBottom: 6,
        }}>
        The short version
      </Text>
      <Text
        style={{ fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 21.5, color: palette.ink }}>
        {readText}
      </Text>

      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: 12,
          backgroundColor: night ? 'rgba(35,183,158,0.16)' : colors.diaperTint,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: radii.pill,
        }}>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 11,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: colors.diaper,
          }}>
          {recapWindowLabel(recap)}
        </Text>
      </View>
    </View>
  );
}
