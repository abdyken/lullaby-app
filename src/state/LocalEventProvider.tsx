/**
 * LocalEventProvider — the single in-memory store for the local night loop.
 *
 * It owns the TonightState (events + orbView) that used to live inside the
 * Tonight screen, so Tonight and Log read/write the SAME local events. All the
 * actual decision-making stays in the pure helpers in
 * '@/data/localInteractions' — this is just a thin React wrapper around them.
 *
 * Still local-only: no persistence, no backend, no external state library.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { getOrbView, type CurrentBabyState, type PreviewState } from '@/data/currentState';
import {
  cappedTimeline,
  handlePrimaryAction,
  handleQuickLog,
  initTonightState,
  selectActiveTile,
  type TonightState,
} from '@/data/localInteractions';
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
  handleFeedTap: () => void;
  handleDiaperTap: () => void;
  handleSleepTap: () => void;
  handlePrimaryAction: () => void;
};

const LocalEventContext = createContext<LocalEventContextValue | null>(null);

export function LocalEventProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TonightState>(() => initTonightState(seedEvents));

  const handleFeedTap = useCallback(() => setState((prev) => handleQuickLog(prev, 'feed')), []);
  const handleDiaperTap = useCallback(() => setState((prev) => handleQuickLog(prev, 'diaper')), []);
  const handleSleepTap = useCallback(() => setState((prev) => handleQuickLog(prev, 'sleep')), []);
  const onPrimaryAction = useCallback(() => setState((prev) => handlePrimaryAction(prev)), []);

  const value = useMemo<LocalEventContextValue>(
    () => ({
      events: state.events,
      orbView: state.orbView,
      orb: getOrbView(state.orbView),
      activeTile: selectActiveTile(state),
      tonightTimeline: cappedTimeline(state),
      fullTimeline: getTonightTimeline(state.events),
      handleFeedTap,
      handleDiaperTap,
      handleSleepTap,
      handlePrimaryAction: onPrimaryAction,
    }),
    [state, handleFeedTap, handleDiaperTap, handleSleepTap, onPrimaryAction],
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
