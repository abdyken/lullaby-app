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

import { AccountSheet } from '@/components/auth/AccountSheet';
import { BabyHeader } from '@/components/BabyHeader';
import { HandoffCard } from '@/components/HandoffCard';
import { LogSheet, type SheetOption } from '@/components/LogSheet';
import { OrbHero } from '@/components/OrbHero';
import { QuickLogRow } from '@/components/QuickLogRow';
import { Screen } from '@/components/Screen';
import { SurfaceToggle } from '@/components/SurfaceToggle';
import { TimelineCard } from '@/components/TimelineCard';
import { TonightStatus } from '@/components/TonightStatus';
import type { PreviewState } from '@/data/currentState';
import type { Baby } from '@/data/models';
import {
  baby as seedBaby,
  babyAgeInWeeks as seedBabyAgeInWeeks,
  caregivers as seedCaregivers,
} from '@/data/mock';
import { useAuth } from '@/state/AuthProvider';
import { useLocalEvents } from '@/state/LocalEventProvider';
import { colors, resolveSurfaceMode, type SurfacePreference } from '@/theme';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Whole-week age from an ISO birth date (Supabase baby has a real birthDate). */
function ageInWeeks(birthDate: string): number {
  const born = new Date(birthDate).getTime();
  if (Number.isNaN(born)) return 0;
  return Math.max(0, Math.floor((Date.now() - born) / WEEK_MS));
}

/** Calm fallback while a Supabase baby row is briefly unavailable. */
const FALLBACK_BABY: Baby = { ...seedBaby, name: 'Your baby' };

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
  const {
    events,
    orb,
    activeTile,
    tonightTimeline,
    syncMode,
    syncStatus,
    handleSleepTap,
    saveFeed,
    saveDiaper,
    saveNote,
    handlePrimaryAction,
  } = useLocalEvents();
  const { baby: remoteBaby, caregivers: remoteCaregivers, caregiver: ownCaregiver } = useAuth();

  // In Supabase mode, show the real linked baby + caregivers; fall back softly if
  // a read is briefly missing. Local-only keeps the seeded Mia / Mom+Dad exactly.
  const isSupabase = syncMode === 'supabase';
  const baby = isSupabase ? (remoteBaby ?? FALLBACK_BABY) : seedBaby;
  const caregivers = isSupabase
    ? remoteCaregivers.length > 0
      ? remoteCaregivers
      : ownCaregiver
        ? [ownCaregiver]
        : []
    : seedCaregivers;
  const ageWeeks = isSupabase
    ? ageInWeeks(baby.birthDate)
    : seedBabyAgeInWeeks(new Date('2026-06-16'));

  const [sheet, setSheet] = useState<SheetKind | null>(null);
  // Account/sign-out lives behind the baby header (blueprint settings home), but
  // only in real-sync mode — local demo keeps the header inert as before.
  const [accountOpen, setAccountOpen] = useState(false);
  // Surface preference is local to Tonight (no persistence needed for the demo).
  // 'auto' resolves against the device clock: low-glare night ~20:00–07:00.
  const [surfacePref, setSurfacePref] = useState<SurfacePreference>('auto');
  const surfaceMode = resolveSurfaceMode(surfacePref, new Date().getHours());

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
      <Screen surfaceMode={surfaceMode}>
        <BabyHeader
          baby={baby}
          ageWeeks={ageWeeks}
          caregivers={caregivers}
          surfaceMode={surfaceMode}
          onPress={syncMode === 'supabase' ? () => setAccountOpen(true) : undefined}
        />

        {/* Low-emphasis Auto / Night / Day control (P0.5). Default Auto. */}
        <View style={{ marginTop: 10 }}>
          <SurfaceToggle value={surfacePref} onChange={setSurfacePref} surfaceMode={surfaceMode} />
        </View>

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
            surfaceMode={surfaceMode}
          />
        </View>

        {/* "Time since last feed / diaper / current sleep" at a glance (P0.5). */}
        <View style={{ marginTop: 13 }}>
          <TonightStatus events={events} surfaceMode={surfaceMode} />
        </View>

        <View style={{ marginTop: 13 }}>
          <QuickLogRow
            selected={activeTile}
            onSelect={handleSelect}
            onNote={() => setSheet('note')}
            surfaceMode={surfaceMode}
          />
        </View>

        <View style={{ marginTop: 13 }}>
          <TimelineCard entries={tonightTimeline} surfaceMode={surfaceMode} />
        </View>

        {/* P0 partner/handoff card — local-only, below the timeline so it never
            pushes the orb / quick-log row down on small screens. */}
        <View style={{ marginTop: 13 }}>
          <HandoffCard
            events={events}
            caregivers={caregivers}
            babyName={baby.name}
            surfaceMode={surfaceMode}
            syncMode={syncMode}
            syncStatus={syncStatus}
          />
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

      {accountOpen && <AccountSheet onClose={() => setAccountOpen(false)} />}
    </>
  );
}
