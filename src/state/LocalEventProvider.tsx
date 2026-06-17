/**
 * LocalEventProvider — the single in-memory store for the local night loop.
 *
 * It owns the TonightState (events + orbView) that used to live inside the
 * Tonight screen, so Tonight and Log read/write the SAME local events. All the
 * actual decision-making stays in the pure helpers in
 * '@/data/localInteractions' — this is just a thin React wrapper around them.
 *
 * It also owns the small "saved · Undo" toast: each save sets a calm toast that
 * auto-dismisses, and Undo removes the most recently saved event. The toast is
 * pure React state here (the pure logic stays in localInteractions); AppToast is
 * the presentational piece that renders it.
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
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getOrbView, type CurrentBabyState, type PreviewState } from '@/data/currentState';
import {
  addDiaper,
  addFeed,
  addNote,
  cappedTimeline,
  handlePrimaryAction,
  handleQuickLog,
  initTonightState,
  selectActiveTile,
  undoLastEvent as undoLastEventPure,
  type TonightState,
} from '@/data/localInteractions';
import { clearLocalEventStorage, loadPersistedState, savePersistedState } from '@/data/localStorage';
import {
  events as seedEvents,
  getTonightTimeline,
  type DiaperDetails,
  type FeedDetails,
  type NoteDetails,
  type TimelineEntry,
} from '@/data/mock';
import type { LogEvent } from '@/data/models';

/** A transient confirmation toast. `id` lets each save reset the auto-dismiss timer. */
export type ToastState = { id: number; message: string };

/** Calm, non-medical toast copy — paired with an Undo affordance in AppToast. */
const TOAST_COPY = {
  feed: 'Feed logged · Undo',
  diaper: 'Diaper logged · Undo',
  sleepStart: 'Sleep started · Undo',
  sleepEnd: 'Sleep logged · Undo',
  note: 'Note saved · Undo',
} as const;

/** How long a toast stays before it quietly fades on its own. */
const TOAST_DURATION_MS = 3200;

/** The preset label a one-tap Note saves (safe, non-diagnostic). */
const NOTE_PRESET_LABEL = 'Settled';

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
  /** active confirmation toast (null when none is showing) */
  toast: ToastState | null;
  /** Sleep stays an immediate, stateful quick action (no sheet). */
  handleSleepTap: () => void;
  /** Save a feed from the Feed sheet (Bottle = {}, Left/Right = { side }). */
  saveFeed: (details?: FeedDetails) => void;
  /** Save a diaper from the Diaper sheet (kind: wet | dirty | both). */
  saveDiaper: (details?: DiaperDetails) => void;
  /** Save a note from the Note sheet (selected label → meta.label). */
  saveNote: (details?: NoteDetails) => void;
  handlePrimaryAction: () => void;
  /** remove the most recently saved event and dismiss the toast */
  undoLastEvent: () => void;
  /** dismiss the toast without undoing anything */
  dismissToast: () => void;
  /** debug: wipe persisted state and return to the seed */
  resetLocalEvents: () => void;
};

const LocalEventContext = createContext<LocalEventContextValue | null>(null);

export function LocalEventProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TonightState>(() => initTonightState(seedEvents));
  // Gate saving on hydration: we must NOT write the seed back over real saved
  // data before the initial load completes.
  const [isHydrated, setIsHydrated] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Mirror the latest state in a ref so the tap handlers can decide whether a
  // save actually added an event (→ show a toast) without depending on `state`
  // in their deps or running side effects inside a setState updater.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const toastSeq = useRef(0);
  const showToast = useCallback((message: string) => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

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

  // Auto-dismiss the current toast after a short, calm delay.
  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => {
      setToast((current) => (current && current.id === toast.id ? null : current));
    }, TOAST_DURATION_MS);
    return () => clearTimeout(handle);
  }, [toast]);

  const handleSleepTap = useCallback(() => {
    const prev = stateRef.current;
    const next = handleQuickLog(prev, 'sleep');
    if (next.events.length > prev.events.length) showToast(TOAST_COPY.sleepStart);
    setState(next);
  }, [showToast]);

  // Sheet saves: only fire when the user taps Save (opening a sheet logs
  // nothing). Each shows its toast only when an event was actually added — the
  // anti-spam guard in addFeed/addDiaper swallows a rapid second save silently.
  const saveFeed = useCallback((details?: FeedDetails) => {
    const prev = stateRef.current;
    const next = addFeed(prev, details);
    if (next.events.length > prev.events.length) showToast(TOAST_COPY.feed);
    setState(next);
  }, [showToast]);

  const saveDiaper = useCallback((details?: DiaperDetails) => {
    const prev = stateRef.current;
    const next = addDiaper(prev, details);
    if (next.events.length > prev.events.length) showToast(TOAST_COPY.diaper);
    setState(next);
  }, [showToast]);

  const saveNote = useCallback((details?: NoteDetails) => {
    // Notes are explicit (no dedup) → always added, always toast.
    showToast(TOAST_COPY.note);
    setState((prev) => addNote(prev, details ?? { label: NOTE_PRESET_LABEL }));
  }, [showToast]);

  const onPrimaryAction = useCallback(() => {
    const prev = stateRef.current;
    const next = handlePrimaryAction(prev);
    // Toast only for the two sleep transitions; End feed / Done don't add or
    // change an event (their toast already showed on the original tap).
    if (prev.orbView === 'calm' && next.events.length > prev.events.length) {
      showToast(TOAST_COPY.sleepStart);
    } else if (prev.orbView === 'sleep') {
      showToast(TOAST_COPY.sleepEnd);
    }
    setState(next);
  }, [showToast]);

  const undoLastEvent = useCallback(() => {
    setState((prev) => undoLastEventPure(prev));
    dismissToast();
  }, [dismissToast]);

  const resetLocalEvents = useCallback(() => {
    void clearLocalEventStorage();
    setState(initTonightState(seedEvents));
    dismissToast();
  }, [dismissToast]);

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
      toast,
      handleSleepTap,
      saveFeed,
      saveDiaper,
      saveNote,
      handlePrimaryAction: onPrimaryAction,
      undoLastEvent,
      dismissToast,
      resetLocalEvents,
    }),
    [
      state,
      isHydrated,
      toast,
      handleSleepTap,
      saveFeed,
      saveDiaper,
      saveNote,
      onPrimaryAction,
      undoLastEvent,
      dismissToast,
      resetLocalEvents,
    ],
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
