/**
 * Tonight — the live night loop home.
 *
 * Order (top → bottom): BabyHeader · OrbHero · QuickLogRow · TimelineCard.
 *
 * State now lives in the shared LocalEventProvider (so Log sees the same
 * events); this screen is a pure view over it. The interaction rules still come
 * from the pure helpers in '@/data/localInteractions'.
 *
 * Theme: the committed surface mode lives in the global ThemeProvider (persisted
 * across restarts). Tapping the toggle lets the native circular-reveal module
 * screenshot the current window, then the real app commits the new mode beneath it.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { AccountSheet } from '@/components/auth/AccountSheet';
import { BabyHeader } from '@/components/BabyHeader';
import { FirstLogCoach, TonightCalibrating } from '@/components/FirstLogCoach';
import { HandoffCard } from '@/components/HandoffCard';
import { LogSheet, type SheetOption } from '@/components/LogSheet';
import { SPITUP_NOTE_LABEL } from '@/features/reassure/domain/recap';
import { DiaperSheet } from '@/features/logging/diaper/DiaperSheet';
import { FeedSheet } from '@/features/logging/feed/FeedSheet';
import { PumpSheet } from '@/features/logging/pump/PumpSheet';
import { SleepSheet } from '@/features/logging/sleep/SleepSheet';
import { useLogging } from '@/features/logging/state/LoggingProvider';
import { useV2TodayView } from '@/features/logging/state/useV2TodayView';
import { OrbHero } from '@/components/OrbHero';
import { QuickLogRow } from '@/components/QuickLogRow';
import { Screen } from '@/components/Screen';
import { TimelineCard } from '@/components/TimelineCard';
import { TonightStatus } from '@/components/TonightStatus';
import { buildHandoffSummary, type PreviewState } from '@/data/currentState';
import { LOCAL_CURSOR_CONTEXT } from '@/data/handoffCursor';
import type { Baby } from '@/data/models';
import { useAnalytics } from '@/lib/useAnalytics';
import { hapticSave } from '@/lib/haptics';
import { baby as seedBaby } from '@/data/mock';
import { useAuth } from '@/state/AuthProvider';
import { useLocalEvents } from '@/state/LocalEventProvider';
import { useTheme } from '@/state/ThemeProvider';
import { useHandoffCursor } from '@/state/useHandoffCursor';
import { colors, type SurfaceMode } from '@/theme';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HOME_CLOCK_TICK_MS = 1000;

function useHomeNowMs(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, HOME_CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return nowMs;
}

/** Whole-week age from an ISO birth date (Supabase baby has a real birthDate). */
function ageInWeeks(birthDate: string): number {
  const born = new Date(birthDate).getTime();
  if (Number.isNaN(born)) return 0;
  return Math.max(0, Math.floor((Date.now() - born) / WEEK_MS));
}

/** Calm fallback while a Supabase baby row is briefly unavailable. */
const FALLBACK_BABY: Baby = { ...seedBaby, name: 'Your baby' };

/** Which detail sheet is open (null = none). Core flows use their v2 sheets. */
type SheetKind = 'note';

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
  note: {
    title: 'Add a note',
    subtitle: 'Just now',
    options: [
      { key: 'Fussy', label: 'Fussy' },
      { key: 'Cried', label: 'Cried' },
      { key: 'Settled', label: 'Settled' },
      // Reassure counts these notes in its night recap — same constant on both
      // sides so the writer and the counter can never drift (smoke §X guard).
      { key: SPITUP_NOTE_LABEL, label: 'Spit-up' },
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
    resetNonce,
  } = useLocalEvents();
  const logging = useLogging();
  const { baby: activeBaby, caregivers: activeCaregivers, caregiver: ownCaregiver } = useAuth();

  // Identity comes from the active baby/caregiver the AuthProvider owns: the
  // linked baby + caregivers in Supabase mode, the seeded Mia / Mom+Dad in
  // local-only mode. A soft FALLBACK_BABY covers a brief missing Supabase read.
  const isSupabase = syncMode === 'supabase';
  const baby = activeBaby ?? FALLBACK_BABY;
  const caregivers = useMemo(
    () => (activeCaregivers.length > 0 ? activeCaregivers : ownCaregiver ? [ownCaregiver] : []),
    [activeCaregivers, ownCaregiver],
  );
  // Age derives from the baby's real birth date against the live clock (no more
  // frozen demo date), so it is correct for both the seed and a real baby.
  const ageWeeks = ageInWeeks(baby.birthDate);

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

  const track = useAnalytics();
  // handoff_has_new_on_open — fire once per focus, only when there is genuinely
  // new caregiver activity on open (the wedge moment). Live values read from a ref
  // so the focus callback stays stable and never re-runs on the 1s clock tick.
  const handoffDataRef = useRef({ events, caregivers, currentCaregiverId, cursor });
  useEffect(() => {
    handoffDataRef.current = { events, caregivers, currentCaregiverId, cursor };
  }, [events, caregivers, currentCaregiverId, cursor]);
  useFocusEffect(
    useCallback(() => {
      const data = handoffDataRef.current;
      const summary = buildHandoffSummary(
        data.events,
        data.caregivers,
        data.currentCaregiverId,
        data.cursor ?? null,
        Date.now(),
      );
      if (summary.hasNew) track('handoff_has_new_on_open');
    }, [track]),
  );

  const { mode: surfaceMode, isTransitioning, toggleThemeFromPoint } = useTheme();

  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [feedV2Open, setFeedV2Open] = useState(false);
  const [sleepV2Open, setSleepV2Open] = useState(false);
  const [diaperV2Open, setDiaperV2Open] = useState(false);
  const [pumpV2Open, setPumpV2Open] = useState(false);
  // Account surface lives behind the baby header (blueprint settings home),
  // reachable in EVERY build — signed-in caregiver, "continue locally" guest, and
  // the unconfigured local demo alike — so there is always an obvious in-app
  // account entry point (it shows auth state, signs out, or routes to the account
  // entry). AccountSheet itself adapts its copy to a configured vs local build.
  const [accountOpen, setAccountOpen] = useState(false);

  // Live render-only clock for elapsed labels and the hero progress ring. During
  // a theme transition we freeze it so labels don't shift under the native reveal.
  const [frozenNow, setFrozenNow] = useState<number | undefined>(undefined);
  const liveNow = useHomeNowMs();
  const displayNow = isTransitioning ? (frozenNow ?? liveNow) : liveNow;

  // Core flows open the canonical v2 sheets. Logging happens inside each sheet's
  // bound use-case; opening/dismissing a sheet never creates an event.
  const handleSelect = (kind: PreviewState) => {
    if (kind === 'sleep') {
      setSleepV2Open(true);
      return;
    }
    if (kind === 'feed') {
      setFeedV2Open(true);
      return;
    }
    if (kind === 'diaper') {
      setDiaperV2Open(true);
    }
  };

  const handleThemeToggle = (pageX?: number, pageY?: number) => {
    if (isTransitioning) return;
    setFrozenNow(Date.now());
    hapticSave();
    void toggleThemeFromPoint(pageX, pageY);
  };

  // Only Save creates the event + toast; dismissing the sheet logs nothing.
  const handleSheetSave = (key: string) => {
    if (sheet === 'note') {
      void logging.saveNote({
        label: key,
        noteType: key === SPITUP_NOTE_LABEL ? 'spit_up' : 'general',
      });
    }
    setSheet(null);
  };

  // Today view from the canonical logging store. Startup waits for hydration in
  // the tab layout; the legacy fallback only protects against impossible partial
  // renders during development.
  const v2View = useV2TodayView({ now: displayNow, caregivers });
  const waitingForV2Hydration = v2View === null;
  const v2 = v2View;
  const heroOrb = v2 ? v2.orb : orb;
  const heroActiveTile = v2 ? v2.activeTile : activeTile;
  const heroPrimaryAction = v2 ? v2.onPrimaryAction : undefined;
  const timelineEntries = v2 ? v2.timeline : tonightTimeline;
  const cardMeta = v2?.quickLogMeta ?? { feed: 'Tap to log', sleep: 'Awake · no sleep yet', diaper: 'Tap to log', pump: 'Log pump' };
  // TonightStatus derives from `events` when no items are passed (legacy path).
  const statusItems = v2 ? v2.tonightStatus : undefined;

  // "Has the parent logged anything real yet?" — read from the canonical Today
  // timeline. The app-shell startup gate holds the tab navigator until logging
  // hydration is ready, so the first tab paint is the real Home screen instead of
  // a tab shell wrapped around a loader.
  const hasRealEvents = v2 ? v2.timeline.length > 0 : events.length > 0;

  // The screen body is parameterised by the committed surface mode so all child
  // components read the same real theme after the native screenshot has frozen.
  const renderBody = (bodyMode: SurfaceMode) => (
    <>
      <BabyHeader
        baby={baby}
        ageWeeks={ageWeeks}
        caregivers={caregivers}
        surfaceMode={bodyMode}
        onPress={() => setAccountOpen(true)}
        onAccount={() => setAccountOpen(true)}
        onThemeToggle={handleThemeToggle}
        themeToggleDisabled={isTransitioning}
      />

      <View style={{ marginTop: 13 }}>
        <OrbHero
          state={heroOrb.state}
          skyTone={heroOrb.skyTone}
          eyebrow={heroOrb.eyebrow}
          timerText={heroOrb.timerText}
          title={heroOrb.title}
          description={heroOrb.description}
          actionLabel={heroOrb.actionLabel}
          progress={heroOrb.progress}
          coreKind={heroOrb.coreKind}
          stateIcon={heroOrb.stateIcon}
          onActionPress={heroPrimaryAction}
          surfaceMode={bodyMode}
        />
      </View>

      {/* "Time since last feed / diaper / current sleep" at a glance (P0.5). */}
      <View style={{ marginTop: 13 }}>
        <TonightStatus events={events} now={displayNow} items={statusItems} surfaceMode={bodyMode} />
      </View>

      {/* Brand-new night (zero real events): a quiet, honest Calibrating line under
          the status strip + a dismissible first-log coach that nudges the first tap
          and, after it, points the eye back up at the status strip. Neither blocks
          the quick-log row — they sit above it (the coach owns its own top margin
          so a hidden coach leaves no gap). */}
      {!hasRealEvents && (
        <View style={{ marginTop: 10 }}>
          <TonightCalibrating babyName={baby.name} surfaceMode={bodyMode} />
        </View>
      )}

      <FirstLogCoach babyName={baby.name} hasRealEvents={hasRealEvents} surfaceMode={bodyMode} />

      <View style={{ marginTop: 13 }}>
        <QuickLogRow
          selected={heroActiveTile}
          onSelect={handleSelect}
          onPump={() => setPumpV2Open(true)}
          meta={cardMeta}
          surfaceMode={bodyMode}
        />
      </View>

      <View style={{ marginTop: 13 }}>
        <TimelineCard entries={timelineEntries} surfaceMode={bodyMode} onAddNote={() => setSheet('note')} />
      </View>

      {/* P0 partner/handoff card — local-only, below the timeline so it never
          pushes the orb / quick-log row down on small screens. */}
      <View style={{ marginTop: 13 }}>
        <HandoffCard
          events={events}
          caregivers={caregivers}
          babyName={baby.name}
          surfaceMode={bodyMode}
          syncMode={syncMode}
          syncStatus={syncStatus}
          currentCaregiverId={currentCaregiverId}
          since={cursor}
          now={displayNow}
          cursorReady={cursorReady}
          onMarkCaughtUp={markCaughtUp}
        />
      </View>
    </>
  );

  return (
    <>
      <Screen surfaceMode={surfaceMode} scrollEnabled={!isTransitioning}>
        {renderBody(surfaceMode)}
      </Screen>

      {!waitingForV2Hydration && sheet !== null && (
        <LogSheet
          key={sheet}
          {...SHEETS[sheet]}
          onSave={handleSheetSave}
          onClose={() => setSheet(null)}
        />
      )}

      {!waitingForV2Hydration && feedV2Open && <FeedSheet onClose={() => setFeedV2Open(false)} />}

      {!waitingForV2Hydration && sleepV2Open && <SleepSheet onClose={() => setSleepV2Open(false)} />}

      {!waitingForV2Hydration && diaperV2Open && <DiaperSheet onClose={() => setDiaperV2Open(false)} />}

      {!waitingForV2Hydration && pumpV2Open && <PumpSheet onClose={() => setPumpV2Open(false)} />}

      {!waitingForV2Hydration && accountOpen && <AccountSheet onClose={() => setAccountOpen(false)} />}
    </>
  );
}
