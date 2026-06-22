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
 * across restarts). Tapping the toggle plays a Telegram-style circular reveal —
 * the screen body is rendered twice (current theme as the base, the incoming
 * theme clipped to an expanding circle on top) — and only commits the new mode
 * to the provider once the circle covers the screen, so there's no flash.
 */
import { useEffect, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AccountSheet } from '@/components/auth/AccountSheet';
import { BabyHeader } from '@/components/BabyHeader';
import { HandoffCard } from '@/components/HandoffCard';
import { LogSheet, type SheetOption } from '@/components/LogSheet';
import { isLoggingV2Enabled } from '@/features/logging';
import { DiaperSheet } from '@/features/logging/diaper/DiaperSheet';
import { FeedSheet } from '@/features/logging/feed/FeedSheet';
import { PumpSheet } from '@/features/logging/pump/PumpSheet';
import { SleepSheet } from '@/features/logging/sleep/SleepSheet';
import { useV2TodayView } from '@/features/logging/state/useV2TodayView';
import { OrbHero, useOrbBreathe } from '@/components/OrbHero';
import { QuickLogRow } from '@/components/QuickLogRow';
import { Screen } from '@/components/Screen';
import { type RevealOrigin } from '@/components/ThemeIconButton';
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

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Global, persisted surface mode + the shared reveal (owned by ThemeProvider
  // so the tab bar can animate the same circle in sync). The base renders
  // against `surfaceMode`; the mode commits once the circle covers the screen.
  const { mode: surfaceMode, reveal, revealProgress, isTransitioning, beginReveal } = useTheme();

  const [sheet, setSheet] = useState<SheetKind | null>(null);
  // Logging v2 Feed sheet (breast session + bottle). Behind the loggingV2 flag;
  // the legacy LogSheet feed path stays the default while the flag is off.
  const loggingV2 = isLoggingV2Enabled();
  const [feedV2Open, setFeedV2Open] = useState(false);
  // Logging v2 Sleep sheet (start/stop active session). Behind the same flag; the
  // legacy orb/Quick-Log sleep path (handleSleepTap) stays default while off.
  const [sleepV2Open, setSleepV2Open] = useState(false);
  // Logging v2 Diaper sheet (instant two-tap log incl. "dry"). Behind the same
  // flag; the legacy LogSheet diaper path stays default while off.
  const [diaperV2Open, setDiaperV2Open] = useState(false);
  // Logging v2 Pump sheet (side + timer + optional volume draft). Behind the same
  // flag; the legacy LogSheet pump path stays default while off.
  const [pumpV2Open, setPumpV2Open] = useState(false);
  // Account/sign-out lives behind the baby header (blueprint settings home), but
  // only in real-sync mode — local demo keeps the header inert as before.
  const [accountOpen, setAccountOpen] = useState(false);

  // Scroll offset snapshotted when a reveal starts, so the revealed copy lines
  // up exactly with the scrolled base layer.
  const [revealScrollY, setRevealScrollY] = useState(0);
  // Live scroll offset kept in a ref (no re-render).
  const scrollYRef = useRef(0);

  // Live render-only clock for elapsed labels and the hero progress ring. During
  // a theme reveal we freeze it so both rendered layers keep identical text and
  // progress until the reveal commits.
  const [frozenNow, setFrozenNow] = useState<number | undefined>(undefined);
  const liveNow = useHomeNowMs();
  const displayNow = isTransitioning ? (frozenNow ?? liveNow) : liveNow;

  // One breathe driver shared by the base orb AND its reveal-overlay copy, so the
  // orb stays perfectly in phase and never appears to jump where the circle crosses it.
  const breathe = useOrbBreathe();

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  };

  // Feed / Diaper open a sheet (logging happens on Save); Sleep stays immediate.
  // With loggingV2 on, Feed opens the new purpose-built FeedSheet instead.
  const handleSelect = (kind: PreviewState) => {
    if (kind === 'sleep') {
      if (loggingV2) setSleepV2Open(true);
      else handleSleepTap();
      return;
    }
    if (kind === 'feed' && loggingV2) {
      setFeedV2Open(true);
      return;
    }
    if (kind === 'diaper' && loggingV2) {
      setDiaperV2Open(true);
      return;
    }
    setSheet(kind);
  };

  const handleThemeToggle = (origin?: RevealOrigin) => {
    if (isTransitioning) return;
    // Fallback origin sits under the toggle (top-right) if measuring missed.
    const fallbackOrigin: RevealOrigin = { x: width - 41, y: insets.top + 35 };
    // Snapshot scroll + freeze the clock so the revealed copy lines up with the
    // base and the time-based labels hold still for the whole reveal.
    setRevealScrollY(scrollYRef.current);
    setFrozenNow(Date.now());
    hapticSave();
    // ThemeProvider runs the shared circle and commits the new mode at the end.
    beginReveal(origin ?? fallbackOrigin);
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
  // Uses the frozen clock so the labels don't shift during a theme reveal.
  const quickLogMeta = buildQuickLogMeta(events, displayNow);

  // Logging v2 — the Today view read from the v2 store (orb, timeline, quick-log
  // cards, status strip). Null when the flag is off, so the legacy useLocalEvents
  // values below are used unchanged (the production path is byte-for-byte the
  // same). When on, the Sleep Hero, the Sleep card, and the Sleep sheet all act on
  // the SAME v2 session — the single source of truth for Sleep (plan Phase 6.5).
  const v2View = useV2TodayView({ now: displayNow, caregivers });
  const v2 = loggingV2 ? v2View : null;
  const heroOrb = v2 ? v2.orb : orb;
  const heroActiveTile = v2 ? v2.activeTile : activeTile;
  const heroPrimaryAction = v2 ? v2.onPrimaryAction : handlePrimaryAction;
  const timelineEntries = v2 ? v2.timeline : tonightTimeline;
  const cardMeta = v2 ? v2.quickLogMeta : quickLogMeta;
  // TonightStatus derives from `events` when no items are passed (legacy path).
  const statusItems = v2 ? v2.tonightStatus : undefined;

  // The whole screen body, parameterised by surface mode so it can be rendered
  // twice during a theme transition (base = current, reveal overlay = incoming)
  // with identical data and layout — only the colours differ.
  const renderBody = (bodyMode: SurfaceMode) => (
    <>
      <BabyHeader
        baby={baby}
        ageWeeks={ageWeeks}
        caregivers={caregivers}
        surfaceMode={bodyMode}
        onPress={syncMode === 'supabase' ? () => setAccountOpen(true) : undefined}
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
          breathe={breathe}
        />
      </View>

      {/* "Time since last feed / diaper / current sleep" at a glance (P0.5). */}
      <View style={{ marginTop: 13 }}>
        <TonightStatus events={events} now={displayNow} items={statusItems} surfaceMode={bodyMode} />
      </View>

      <View style={{ marginTop: 13 }}>
        <QuickLogRow
          selected={heroActiveTile}
          onSelect={handleSelect}
          onPump={() => (loggingV2 ? setPumpV2Open(true) : setSheet('pump'))}
          meta={cardMeta}
          surfaceMode={bodyMode}
        />
      </View>

      <View style={{ marginTop: 13 }}>
        <TimelineCard entries={timelineEntries} surfaceMode={bodyMode} />
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
      <Screen surfaceMode={surfaceMode} onScroll={handleScroll} scrollEnabled={!isTransitioning}>
        {renderBody(surfaceMode)}
      </Screen>

      {sheet !== null && (
        <LogSheet
          key={sheet}
          {...SHEETS[sheet]}
          onSave={handleSheetSave}
          onClose={() => setSheet(null)}
        />
      )}

      {feedV2Open && <FeedSheet onClose={() => setFeedV2Open(false)} />}

      {sleepV2Open && <SleepSheet onClose={() => setSleepV2Open(false)} />}

      {diaperV2Open && <DiaperSheet onClose={() => setDiaperV2Open(false)} />}

      {pumpV2Open && <PumpSheet onClose={() => setPumpV2Open(false)} />}

      {accountOpen && <AccountSheet onClose={() => setAccountOpen(false)} />}

      {/* Flip the status bar to the incoming theme as the reveal starts (the
          top edge is covered almost immediately). On commit this unmounts and
          the root status bar — now on the committed mode — takes over seamlessly. */}
      {reveal.active && <StatusBar style={reveal.toMode === 'night' ? 'light' : 'dark'} />}

      {/* The incoming theme, rendered through the *same* Screen component as the
          base (so layout/padding match exactly — no misalignment) and revealed
          through the expanding circular mask. It's a frozen copy pinned to the
          base's scroll offset. The floating tab bar reveals the same circle
          itself (see LullabyTabBar), so coverage is continuous to the corners. */}
      <ThemeRevealOverlay
        visible={reveal.active}
        originX={reveal.origin.x}
        originY={reveal.origin.y}
        maxRadius={reveal.maxRadius}
        progress={revealProgress}>
        <Screen surfaceMode={reveal.toMode} scrollEnabled={false} contentOffset={{ x: 0, y: revealScrollY }}>
          {renderBody(reveal.toMode)}
        </Screen>
      </ThemeRevealOverlay>
    </>
  );
}
