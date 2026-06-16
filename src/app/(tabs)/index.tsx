/**
 * Tonight — the live night loop home.
 *
 * Order (top → bottom): BabyHeader · OrbHero · QuickLogRow · TimelineCard.
 * The orb reflects the live mock state; tapping a quick-log tile previews that
 * state so the orb and the row visually agree. No data is written yet — this is
 * still UI against the in-memory mock store.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { BabyHeader } from '@/components/BabyHeader';
import { OrbHero } from '@/components/OrbHero';
import { QuickLogRow } from '@/components/QuickLogRow';
import { Screen } from '@/components/Screen';
import { TimelineCard } from '@/components/TimelineCard';
import { getCurrentBabyState, getPreviewBabyState, type PreviewState } from '@/data/currentState';
import { baby, babyAgeInWeeks, caregivers, getTonightTimeline } from '@/data/mock';

function toPreviewState(state: string): PreviewState {
  return state === 'feed' || state === 'diaper' ? state : 'sleep';
}

export default function TonightScreen() {
  const ageWeeks = babyAgeInWeeks(new Date('2026-06-16'));
  const liveState = getCurrentBabyState();
  const timeline = getTonightTimeline();

  // Local preview only — which quick-log tile is "active" / shown on the orb.
  const [selected, setSelected] = useState<PreviewState>(toPreviewState(liveState.state));

  // Use the rich live snapshot when the selection matches reality; otherwise a
  // canned preview for the tapped state.
  const orb = selected === liveState.state ? liveState : getPreviewBabyState(selected);

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
        />
      </View>

      <View style={{ marginTop: 13 }}>
        <QuickLogRow selected={selected} onSelect={setSelected} />
      </View>

      <View style={{ marginTop: 13 }}>
        <TimelineCard entries={timeline} />
      </View>
    </Screen>
  );
}
