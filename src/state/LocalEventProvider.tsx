/**
 * LocalEventProvider — the single in-memory store for the local night loop.
 *
 * It owns the TonightState (events + orbView) that used to live inside the
 * Tonight screen, so Tonight and Log read/write the SAME local events. All the
 * actual decision-making stays in the pure helpers in
 * '@/data/localInteractions' — this is just a thin React wrapper around them.
 *
 * Local-only persistence: the events + orbView are cached in AsyncStorage so
 * logs survive an app reload/restart. Still no backend, no external state
 * library. Hydration is guarded so the seed is never saved over real data
 * before the load finishes (see isHydrated below).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getOrbView, type CurrentBabyState, type PreviewState } from '@/data/currentState';
import {
  cappedTimeline,
  handlePrimaryAction,
  handleQuickLog,
  initTonightState,
  selectActiveTile,
  type TonightState,
} from '@/data/localInteractions';
import { clearLocalEventStorage, loadPersistedState, savePersistedState } from '@/data/localStorage';
import { events as seedEvents, getTonightTimeline, type TimelineEntry } from '@/data/mock';
import type { LogEvent } from '@/data/models';

type LocalEventContextValue = {
  events: LogEvent[];
  orbView: TonightState['orbView'];
  /** canned orb snapshot for the current view */
  orb: CurrentBabyState;
  /** active quick-log tile (null when calm) */
  activeTile: PreviewState | null;
  /** newest few events for the Tonight home */
  tonightTimeline: TimelineEntry[];
  /** the complete history for the Log tab */
  fullTimeline: TimelineEntry[];
  /** true once the saved state has loaded (or been confirmed absent) */
  isHydrated: boolean;
  handleFeedTap: () => void;
  handleDiaperTap: () => void;
  handleSleepTap: () => void;
  handlePrimaryAction: () => void;
  /** debug: wipe persisted state and return to the seed */
  resetLocalEvents: () => void;
};

const LocalEventContext = createContext<LocalEventContextValue | null>(null);

export function LocalEventProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TonightState>(() => initTonightState(seedEvents));
  // Gate saving on hydration: we must NOT write the seed back over real saved
  // data before the initial load completes.
  const [isHydrated, setIsHydrated] = useState(false);

  // Load once on mount. If valid saved state exists, adopt it; otherwise keep
  // the seed. Either way we mark hydrated so saving can begin.
  useEffect(() => {
    let cancelled = false;
    loadPersistedState().then((saved) => {
      if (cancelled) return;
      if (saved) setState(saved);
      setIsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every change, but only after hydration. On first launch this
  // also writes the seed once (so the starting point is captured).
  useEffect(() => {
    if (!isHydrated) return;
    void savePersistedState(state);
  }, [state, isHydrated]);

  const handleFeedTap = useCallback(() => setState((prev) => handleQuickLog(prev, 'feed')), []);
  const handleDiaperTap = useCallback(() => setState((prev) => handleQuickLog(prev, 'diaper')), []);
  const handleSleepTap = useCallback(() => setState((prev) => handleQuickLog(prev, 'sleep')), []);
  const onPrimaryAction = useCallback(() => setState((prev) => handlePrimaryAction(prev)), []);
  const resetLocalEvents = useCallback(() => {
    void clearLocalEventStorage();
    setState(initTonightState(seedEvents));
  }, []);

  const value = useMemo<LocalEventContextValue>(
    () => ({
      events: state.events,
      orbView: state.orbView,
      // Fill the orb's existing fields with real values from the live events
      // (running-sleep duration / start, calm "last feed · last diaper" line).
      // `now` defaults inside getOrbView (same pattern as cappedTimeline below).
      orb: getOrbView(state.orbView, state.events),
      activeTile: selectActiveTile(state),
      tonightTimeline: cappedTimeline(state),
      fullTimeline: getTonightTimeline(state.events),
      isHydrated,
      handleFeedTap,
      handleDiaperTap,
      handleSleepTap,
      handlePrimaryAction: onPrimaryAction,
      resetLocalEvents,
    }),
    [state, isHydrated, handleFeedTap, handleDiaperTap, handleSleepTap, onPrimaryAction, resetLocalEvents],
  );

  return <LocalEventContext.Provider value={value}>{children}</LocalEventContext.Provider>;
}

/** Access the shared local event state. Must be used under LocalEventProvider. */
export function useLocalEvents(): LocalEventContextValue {
  const ctx = useContext(LocalEventContext);
  if (!ctx) {
    throw new Error('useLocalEvents must be used within a LocalEventProvider');
  }
  return ctx;
}
