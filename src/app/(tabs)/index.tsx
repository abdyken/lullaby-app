/**
 * Tonight — the live night loop home.
 *
 * Order (top → bottom): BabyHeader · OrbHero · QuickLogRow · TimelineCard.
 *
 * State now lives in the shared LocalEventProvider (so Log sees the same
 * events); this screen is a pure view over it. The interaction rules still come
 * from the pure helpers in '@/data/localInteractions'.
 */
import { View } from 'react-native';

import { BabyHeader } from '@/components/BabyHeader';
import { OrbHero } from '@/components/OrbHero';
import { QuickLogRow } from '@/components/QuickLogRow';
import { Screen } from '@/components/Screen';
import { TimelineCard } from '@/components/TimelineCard';
import type { PreviewState } from '@/data/currentState';
import { baby, babyAgeInWeeks, caregivers } from '@/data/mock';
import { useLocalEvents } from '@/state/LocalEventProvider';

export default function TonightScreen() {
  const ageWeeks = babyAgeInWeeks(new Date('2026-06-16'));
  const {
    orb,
    activeTile,
    tonightTimeline,
    handleFeedTap,
    handleDiaperTap,
    handleSleepTap,
    handlePrimaryAction,
  } = useLocalEvents();

  const handleSelect = (kind: PreviewState) => {
    if (kind === 'feed') handleFeedTap();
    else if (kind === 'diaper') handleDiaperTap();
    else handleSleepTap();
  };

  return (
    <Screen>
      <BabyHeader baby={baby} ageWeeks={ageWeeks} caregivers={caregivers} />

      <View style={{ marginTop: 13 }}>
        <OrbHero
          state={orb.state}
          skyTone={orb.skyTone}
          eyebrow={orb.eyebrow}
          timerText={orb.timerText}
          title={orb.title}
          description={orb.description}
          actionLabel={orb.actionLabel}
          progress={orb.progress}
          coreKind={orb.coreKind}
          onActionPress={handlePrimaryAction}
        />
      </View>

      <View style={{ marginTop: 13 }}>
        <QuickLogRow selected={activeTile} onSelect={handleSelect} />
      </View>

      <View style={{ marginTop: 13 }}>
        <TimelineCard entries={tonightTimeline} />
      </View>
    </Screen>
  );
}
