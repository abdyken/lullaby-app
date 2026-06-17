/**
 * Tonight — the live night loop home.
 *
 * Order (top → bottom): BabyHeader · OrbHero · QuickLogRow · TimelineCard.
 *
 * State now lives in the shared LocalEventProvider (so Log sees the same
 * events); this screen is a pure view over it. The interaction rules still come
 * from the pure helpers in '@/data/localInteractions'.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { BabyHeader } from '@/components/BabyHeader';
import { HandoffCard } from '@/components/HandoffCard';
import { LogSheet, type SheetOption } from '@/components/LogSheet';
import { OrbHero } from '@/components/OrbHero';
import { QuickLogRow } from '@/components/QuickLogRow';
import { Screen } from '@/components/Screen';
import { TimelineCard } from '@/components/TimelineCard';
import type { PreviewState } from '@/data/currentState';
import { baby, babyAgeInWeeks, caregivers } from '@/data/mock';
import { useLocalEvents } from '@/state/LocalEventProvider';
import { colors } from '@/theme';

/** Which detail sheet is open (null = none). Sleep never uses a sheet. */
type SheetKind = 'feed' | 'diaper' | 'note';

type SheetConfig = {
  title: string;
  subtitle: string;
  options: SheetOption[];
  defaultKey: string;
  saveLabel: string;
  accentColor: string;
  accentTint: string;
};

const SHEETS: Record<SheetKind, SheetConfig> = {
  feed: {
    title: 'Log a feed',
    subtitle: 'Just now',
    options: [
      { key: 'bottle', label: 'Bottle' },
      { key: 'L', label: 'Left' },
      { key: 'R', label: 'Right' },
    ],
    defaultKey: 'L',
    saveLabel: 'Save feed',
    accentColor: colors.feed,
    accentTint: colors.feedTint,
  },
  diaper: {
    title: 'Log a diaper',
    subtitle: 'Just now',
    options: [
      { key: 'wet', label: 'Wet' },
      { key: 'dirty', label: 'Dirty' },
      { key: 'both', label: 'Mixed' },
    ],
    defaultKey: 'wet',
    saveLabel: 'Save diaper',
    accentColor: colors.diaper,
    accentTint: colors.diaperTint,
  },
  note: {
    title: 'Add a note',
    subtitle: 'Just now',
    options: [
      { key: 'Fussy', label: 'Fussy' },
      { key: 'Cried', label: 'Cried' },
      { key: 'Settled', label: 'Settled' },
    ],
    defaultKey: 'Settled',
    saveLabel: 'Save note',
    accentColor: colors.sleep,
    accentTint: colors.sleepTint,
  },
};

export default function TonightScreen() {
  const ageWeeks = babyAgeInWeeks(new Date('2026-06-16'));
  const {
    events,
    orb,
    activeTile,
    tonightTimeline,
    handleSleepTap,
    saveFeed,
    saveDiaper,
    saveNote,
    handlePrimaryAction,
  } = useLocalEvents();

  const [sheet, setSheet] = useState<SheetKind | null>(null);

  // Feed / Diaper open a sheet (logging happens on Save); Sleep stays immediate.
  const handleSelect = (kind: PreviewState) => {
    if (kind === 'sleep') handleSleepTap();
    else setSheet(kind);
  };

  // Only Save creates the event + toast; dismissing the sheet logs nothing.
  const handleSheetSave = (key: string) => {
    if (sheet === 'feed') saveFeed(key === 'bottle' ? {} : { side: key as 'L' | 'R' });
    else if (sheet === 'diaper') saveDiaper({ kind: key as 'wet' | 'dirty' | 'both' });
    else if (sheet === 'note') saveNote({ label: key });
    setSheet(null);
  };

  return (
    <>
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
          <QuickLogRow selected={activeTile} onSelect={handleSelect} onNote={() => setSheet('note')} />
        </View>

        <View style={{ marginTop: 13 }}>
          <TimelineCard entries={tonightTimeline} />
        </View>

        {/* P0 partner/handoff card — local-only, below the timeline so it never
            pushes the orb / quick-log row down on small screens. */}
        <View style={{ marginTop: 13 }}>
          <HandoffCard events={events} caregivers={caregivers} babyName={baby.name} />
        </View>
      </Screen>

      {sheet !== null && (
        <LogSheet
          key={sheet}
          {...SHEETS[sheet]}
          onSave={handleSheetSave}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
