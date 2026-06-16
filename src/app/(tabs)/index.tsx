/**
 * Tonight — the live night loop home.
 *
 * Phase 2 starts with the product's heart: BabyHeader + OrbHero. Quick logging
 * and the tonight timeline intentionally stay as a small placeholder below.
 */
import { Text, View } from 'react-native';

import { BabyHeader } from '@/components/BabyHeader';
import { Card } from '@/components/Card';
import { OrbHero } from '@/components/OrbHero';
import { Screen } from '@/components/Screen';
import { getCurrentBabyState } from '@/data/currentState';
import { baby, babyAgeInWeeks, caregivers } from '@/data/mock';
import { colors, fonts } from '@/theme';

export default function TonightScreen() {
  const ageWeeks = babyAgeInWeeks(new Date('2026-06-16'));
  const currentState = getCurrentBabyState();

  return (
    <Screen>
      <BabyHeader baby={baby} ageWeeks={ageWeeks} caregivers={caregivers} />

      <View style={{ marginTop: 13 }}>
        <OrbHero
          state={currentState.state}
          skyTone={currentState.skyTone}
          eyebrow={currentState.eyebrow}
          timerText={currentState.timerText}
          title={currentState.title}
          description={currentState.description}
          actionLabel={currentState.actionLabel}
          progress={currentState.progress}
          coreKind={currentState.coreKind}
        />
      </View>

      <Card style={{ marginTop: 13, paddingVertical: 14 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkSoft }}>
          Quick log and tonight timeline come next.
        </Text>
      </Card>
    </Screen>
  );
}
