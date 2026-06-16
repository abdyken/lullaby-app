/**
 * Tonight — the live night loop home (placeholder for this foundation stage).
 *
 * The real screen is the orb hero + quick-log row + timeline + partner card
 * (§4). For now it's a calm title/subtitle plus a note marking what comes next,
 * and a small live readout from the mock store to prove the data wiring.
 */
import { Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { baby, babyAgeInWeeks, tonightEventCount } from '@/data/mock';
import { colors, fonts, getAccentForState, radii, shadows } from '@/theme';

export default function TonightScreen() {
  const accent = getAccentForState('sleep');
  const ageWeeks = babyAgeInWeeks(new Date('2026-06-16'));

  return (
    <Screen>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.4, color: accent.color }}>
        TONIGHT
      </Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.ink, marginTop: 6 }}>
        {baby.name}
      </Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, marginTop: 2 }}>
        {ageWeeks} weeks old · all quiet
      </Text>

      <View
        className="mt-7 rounded-md bg-surface p-5"
        style={{ borderRadius: radii.medium, ...shadows.card }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.ink }}>
          The orb dashboard comes next
        </Text>
        <Text
          style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 6, lineHeight: 19 }}>
          This is the foundation shell. The breathing orb, quick-log row, tonight timeline, and
          partner card will land on this screen next.
        </Text>

        <View
          style={{
            marginTop: 16,
            alignSelf: 'flex-start',
            backgroundColor: accent.tint,
            borderRadius: radii.pill,
            paddingHorizontal: 14,
            paddingVertical: 7,
          }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: accent.color }}>
            {tonightEventCount()} events logged tonight
          </Text>
        </View>
      </View>
    </Screen>
  );
}
