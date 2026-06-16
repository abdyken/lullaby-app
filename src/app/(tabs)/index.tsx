/**
 * Tonight — the live night loop home.
 *
 * Order (top → bottom): BabyHeader · OrbHero · QuickLogRow · TimelineCard.
 *
 * Local-only interaction model (no backend, no persistence):
 *  - `localEvents` is the source of truth, a copy of the seed.
 *  - `orbView` is a tiny state machine ('feed' | 'sleep' | 'diaper' | 'calm')
 *    that drives the orb AND the active quick-log tile, so they always agree.
 *  - Quick-log taps append at most one event per kind per ~45s (no spam).
 *  - The orb's primary button performs the contextual action (Wake / End / Done
 *    / Start sleep) and returns to a calm state.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { BabyHeader } from '@/components/BabyHeader';
import { OrbHero } from '@/components/OrbHero';
import { QuickLogRow } from '@/components/QuickLogRow';
import { Screen } from '@/components/Screen';
import { TimelineCard } from '@/components/TimelineCard';
import { getOrbView, type PreviewState } from '@/data/currentState';
import {
  cappedTimeline,
  handlePrimaryAction,
  handleQuickLog,
  initTonightState,
  selectActiveTile,
  type TonightState,
} from '@/data/localInteractions';
import { baby, babyAgeInWeeks, caregivers, events as seedEvents } from '@/data/mock';

export default function TonightScreen() {
  const ageWeeks = babyAgeInWeeks(new Date('2026-06-16'));

  // All Tonight interaction state lives in one object, driven by the pure
  // helpers in '@/data/localInteractions' (no backend, no persistence yet).
  const [state, setState] = useState<TonightState>(() => initTonightState(seedEvents));

  const orb = getOrbView(state.orbView);
  const activeTile = selectActiveTile(state);
  const timeline = cappedTimeline(state);

  const handleSelect = (kind: PreviewState) => setState((prev) => handleQuickLog(prev, kind));
  const handleAction = () => setState((prev) => handlePrimaryAction(prev));

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
          onActionPress={handleAction}
        />
      </View>

      <View style={{ marginTop: 13 }}>
        <QuickLogRow selected={activeTile} onSelect={handleSelect} />
      </View>

      <View style={{ marginTop: 13 }}>
        <TimelineCard entries={timeline} />
      </View>
    </Screen>
  );
}
