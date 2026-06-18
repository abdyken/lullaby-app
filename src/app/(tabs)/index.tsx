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
import { Animated, Easing, View } from 'react-native';

import { AccountSheet } from '@/components/auth/AccountSheet';
import { BabyHeader } from '@/components/BabyHeader';
import { HandoffCard } from '@/components/HandoffCard';
import { LogSheet, type SheetOption } from '@/components/LogSheet';
import { OrbHero } from '@/components/OrbHero';
import { QuickLogRow } from '@/components/QuickLogRow';
import { Screen } from '@/components/Screen';
import { ThemeRevealOverlay } from '@/components/ThemeRevealOverlay';
import { TimelineCard } from '@/components/TimelineCard';
import { TonightStatus } from '@/components/TonightStatus';
import { buildQuickLogMeta, type PreviewState } from '@/data/currentState';
import { LOCAL_CURSOR_CONTEXT } from '@/data/handoffCursor';
import type { Baby } from '@/data/models';
import { hapticSave } from '@/lib/haptics';
import {
  baby as seedBaby,
  babyAgeInWeeks as seedBabyAgeInWeeks,
  caregivers as seedCaregivers,
} from '@/data/mock';
import { useAuth } from '@/state/AuthProvider';
import { useLocalEvents } from '@/state/LocalEventProvider';
import { useHandoffCursor } from '@/state/useHandoffCursor';
import { colors, surfaces, type SurfaceMode } from '@/theme';

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
type SheetKind = 'feed' | 'diaper' | 'note' | 'pump';

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
  pump: {
    title: 'Log a pump',
    subtitle: 'Just now',
    options: [
      { key: 'L', label: 'Left' },
      { key: 'R', label: 'Right' },
      { key: 'both', label: 'Both' },
    ],
    defaultKey: 'both',
    saveLabel: 'Save pump',
    accentColor: colors.pump,
    accentTint: colors.pumpTint,
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
    savePump,
    handlePrimaryAction,
    resetNonce,
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

  // Device-local handoff cursor. Keyed per caregiver+baby in Supabase mode so two
  // accounts on one device don't share a "caught up" state; a single 'local' key
  // in the demo. currentCaregiverId stays null locally (no "You" attribution).
  const currentCaregiverId = isSupabase ? (ownCaregiver?.id ?? null) : null;
  const cursorContext =
    isSupabase && currentCaregiverId
      ? `${currentCaregiverId}:${baby.id}`
      : LOCAL_CURSOR_CONTEXT;
  // A local demo reset clears the cursor and bumps resetNonce so the hook
  // re-reads it (the seeded night shows its catch-up story again, not "Nothing
  // new"). resetNonce never changes in Supabase mode.
  const { cursor, ready: cursorReady, markCaughtUp } = useHandoffCursor(cursorContext, resetNonce);

  const [sheet, setSheet] = useState<SheetKind | null>(null);
  // Account/sign-out lives behind the baby header (blueprint settings home), but
  // only in real-sync mode — local demo keeps the header inert as before.
  const [accountOpen, setAccountOpen] = useState(false);
  // Telegram-style direct theme toggle. Local to Tonight for now.
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('day');
  const [themeAnimating, setThemeAnimating] = useState(false);
  const [revealVisible, setRevealVisible] = useState(false);
  const [revealColor, setRevealColor] = useState(surfaces.day.bg);
  const [revealProgress] = useState(() => new Animated.Value(0));
  const [revealOpacity] = useState(() => new Animated.Value(0));

  // Feed / Diaper open a sheet (logging happens on Save); Sleep stays immediate.
  const handleSelect = (kind: PreviewState) => {
    if (kind === 'sleep') handleSleepTap();
    else setSheet(kind);
  };

  const handleThemeToggle = () => {
    if (themeAnimating) return;

    const nextMode: SurfaceMode = surfaceMode === 'night' ? 'day' : 'night';
    hapticSave();
    setThemeAnimating(true);
    setRevealColor(surfaces[nextMode].bg);
    setRevealVisible(true);
    revealProgress.setValue(0);
    revealOpacity.setValue(1);

    Animated.timing(revealProgress, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setSurfaceMode(nextMode);
      Animated.timing(revealOpacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setRevealVisible(false);
        setThemeAnimating(false);
      });
    });
  };

  // Only Save creates the event + toast; dismissing the sheet logs nothing.
  const handleSheetSave = (key: string) => {
    if (sheet === 'feed') saveFeed(key === 'bottle' ? {} : { side: key as 'L' | 'R' });
    else if (sheet === 'diaper') saveDiaper({ kind: key as 'wet' | 'dirty' | 'both' });
    else if (sheet === 'note') saveNote({ label: key });
    else if (sheet === 'pump') savePump({ side: key as 'L' | 'R' | 'both' });
    setSheet(null);
  };

  // Descriptive secondary lines for the quick-log cards, derived from live events.
  const quickLogMeta = buildQuickLogMeta(events);

  return (
    <>
      <Screen surfaceMode={surfaceMode}>
        <BabyHeader
          baby={baby}
          ageWeeks={ageWeeks}
          caregivers={caregivers}
          surfaceMode={surfaceMode}
          onPress={syncMode === 'supabase' ? () => setAccountOpen(true) : undefined}
          onThemeToggle={handleThemeToggle}
          themeToggleDisabled={themeAnimating}
        />

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
            onPump={() => setSheet('pump')}
            meta={quickLogMeta}
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
            currentCaregiverId={currentCaregiverId}
            since={cursor}
            cursorReady={cursorReady}
            onMarkCaughtUp={markCaughtUp}
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

      <ThemeRevealOverlay
        visible={revealVisible}
        color={revealColor}
        progress={revealProgress}
        opacity={revealOpacity}
      />
    </>
  );
}
