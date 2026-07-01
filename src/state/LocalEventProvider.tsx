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
  addPump,
  cappedTimeline,
  handlePrimaryAction,
  handleQuickLog,
  initTonightState,
  selectActiveTile,
  undoLastEvent as undoLastEventPure,
  undoLastOwnEvent,
  type TonightState,
} from '@/data/localInteractions';
import {
  events as seedEvents,
  getTonightTimeline,
  type DiaperDetails,
  type FeedDetails,
  type NoteDetails,
  type PumpDetails,
  type TimelineEntry,
} from '@/data/mock';
import { clearHandoffCursor, LOCAL_CURSOR_CONTEXT } from '@/data/handoffCursor';
import type { LogEvent } from '@/data/models';
import { type AnalyticsEvent } from '@/lib/analytics';
import { useAnalytics } from '@/lib/useAnalytics';
import { fireMilestoneOnce, firstLogMilestoneKey } from '@/lib/analyticsMilestones';
import { hapticSave, hapticUndo } from '@/lib/haptics';
import { logStartupStep } from '@/lib/startupDiagnostics';
import { useAuth } from '@/state/AuthProvider';
import {
  diffEvents,
  isEmptyChange,
  LOCAL_ONLY_STATUS,
  localRepository,
  resolveRepository,
  type EventRepository,
  type SyncMode,
  type SyncStatus,
} from '@/sync';

/** A transient confirmation toast. `id` lets each save reset the auto-dismiss timer. */
export type ToastState = { id: number; message: string };

/** Calm, non-medical toast copy — paired with an Undo affordance in AppToast. */
const TOAST_COPY = {
  feed: 'Feed logged · Undo',
  diaper: 'Diaper logged · Undo',
  sleepStart: 'Sleep started · Undo',
  sleepEnd: 'Sleep logged · Undo',
  note: 'Note saved · Undo',
  pump: 'Pump logged · Undo',
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
  /** which backend the night state is read/written through (local-only by default) */
  syncMode: SyncMode;
  /** calm sync status for a future indicator (local-only in demo mode) */
  syncStatus: SyncStatus;
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
  /** Save a pump from the Pump sheet (Left/Right/Both → meta.side when L/R). */
  savePump: (details?: PumpDetails) => void;
  handlePrimaryAction: () => void;
  /** remove the most recently saved event and dismiss the toast */
  undoLastEvent: () => void;
  /** dismiss the toast without undoing anything */
  dismissToast: () => void;
  /** debug: wipe persisted state and return to the seed */
  resetLocalEvents: () => void;
  /**
   * Bumped by a local demo reset so the handoff cursor hook re-reads the (now
   * cleared) cursor and the seeded night shows its catch-up story again. Local
   * demo only — never changes in Supabase mode.
   */
  resetNonce: number;
};

const LocalEventContext = createContext<LocalEventContextValue | null>(null);

export function LocalEventProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TonightState>(() => initTonightState(seedEvents));
  // Gate saving on hydration: we must NOT write the seed back over real saved
  // data before the initial load completes.
  const [isHydrated, setIsHydrated] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  // Incremented by a local demo reset (below) to re-gate the handoff cursor.
  const [resetNonce, setResetNonce] = useState(0);

  // The backend the night state flows through. Defaults to local (identical to
  // the previous direct-AsyncStorage behavior); resolveRepository may swap in a
  // Supabase repository on mount when sync is fully configured + signed in.
  const repositoryRef = useRef<EventRepository>(localRepository);
  const [syncMode, setSyncMode] = useState<SyncMode>('local-only');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(LOCAL_ONLY_STATUS);

  // Realtime echo guard: when state is set FROM a remote change (load or a live
  // subscription update), this is flipped true so the persistence effect skips
  // pushing it straight back — which would loop forever in Supabase mode.
  const applyingRemoteRef = useRef(false);
  // The event set last known to be in sync with the backend. Local changes are
  // diffed against this so we push only what changed (per-event), and it's reset
  // whenever a remote state is adopted.
  const syncedEventsRef = useRef<LogEvent[]>([]);

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

  const { session, baby } = useAuth();
  const authUserId = session?.user.id ?? null;
  const authBabyId = baby?.id;
  const authBabyReady = baby != null;
  const track = useAnalytics();
  // first_log_created fires once per account+baby (persisted, scoped by
  // userId+babyId). The ref tracks the last key it fired for, so a burst of saves
  // can't double-fire AND a sign-out/in (a new key) re-arms it. `noteLogged` is
  // called wherever an event is actually added; pass the per-type event
  // (feed/sleep) when there is one.
  const firstLogFiredKeyRef = useRef<string | null>(null);
  const noteLogged = useCallback(
    (event?: AnalyticsEvent) => {
      if (event) track(event);
      const key = firstLogMilestoneKey(session?.user.id ?? null, baby?.id ?? null);
      if (firstLogFiredKeyRef.current !== key) {
        firstLogFiredKeyRef.current = key;
        void fireMilestoneOnce(key, () => track('first_log_created'));
      }
    },
    [track, session?.user.id, baby?.id],
  );

  // Resolve the backend, load once on mount, then (Supabase) subscribe to live
  // changes. If valid saved state exists, adopt it; otherwise keep the seed.
  // Either way we mark hydrated so saving can begin. In local-only mode this is
  // identical to the previous direct load (no subscription).
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    logStartupStep('events hydrate start', {
      signedIn: authUserId != null,
      babyReady: authBabyReady,
    });
    (async () => {
      const repository = await resolveRepository({
        userId: authUserId,
        babyId: authBabyId,
      });
      if (cancelled) return;
      repositoryRef.current = repository;
      setSyncMode(repository.mode);
      if (repository.mode === 'supabase') {
        setSyncStatus({ kind: 'syncing', lastSyncedAt: null });
      }

      const saved = await repository.load();
      if (cancelled) return;
      if (saved) {
        // Adopt remote/persisted state without pushing it back out.
        applyingRemoteRef.current = true;
        syncedEventsRef.current = saved.events;
        setState(saved);
      }

      if (repository.mode === 'supabase') {
        setSyncStatus({ kind: 'synced', lastSyncedAt: new Date().toISOString() });
        // Live updates: a partner's (or another device's) change re-reads the
        // night and replaces our event list. Flagged as remote so it isn't
        // echoed back. We adopt the shared EVENTS but keep our own orbView — the
        // orb is this device's interaction context (a "Feed logged" confirmation
        // shouldn't snap to calm when our own write echoes back, or when a
        // partner logs something). Cleaned up on unmount / sign-out below.
        const teardown = repository.subscribe?.((remoteState) => {
          if (cancelled) return;
          applyingRemoteRef.current = true;
          syncedEventsRef.current = remoteState.events;
          setState((prev) => ({ events: remoteState.events, orbView: prev.orbView }));
          setSyncStatus({ kind: 'synced', lastSyncedAt: new Date().toISOString() });
        });
        // If this mount was torn down (StrictMode double-invoke / fast remount)
        // while the async work above was in flight, the cleanup already ran with
        // no unsubscribe to call — so close the just-opened channel right here
        // instead of leaking it (which would collide with the next subscription).
        if (cancelled) {
          teardown?.();
        } else {
          unsubscribe = teardown;
        }
      }
      setIsHydrated(true);
      logStartupStep('events hydrate ready', {
        mode: repository.mode,
        restored: saved != null,
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [authUserId, authBabyId, authBabyReady]);

  // Persist on every change, but only after hydration.
  //  - local-only: whole-state save to AsyncStorage (unchanged; writes the seed
  //    once on first launch).
  //  - supabase: push only the diff vs the last synced set (per-event upserts +
  //    deletes), so a tap writes one row and Undo deletes one row.
  // Remote-applied changes are skipped here (echo guard) — they're already the
  // source of truth.
  useEffect(() => {
    if (!isHydrated) return;

    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      syncedEventsRef.current = state.events;
      return;
    }

    const repository = repositoryRef.current;
    if (repository.mode === 'local-only') {
      void repository.save(state);
      return;
    }

    const changes = diffEvents(syncedEventsRef.current, state.events);
    if (isEmptyChange(changes)) return;

    setSyncStatus((prev) => ({ ...prev, kind: 'syncing' }));
    const apply = repository.applyChanges
      ? repository.applyChanges(changes)
      : repository.save(state);
    apply
      .then(() => {
        syncedEventsRef.current = state.events;
        setSyncStatus({ kind: 'synced', lastSyncedAt: new Date().toISOString() });
      })
      .catch(() => setSyncStatus((prev) => ({ ...prev, kind: 'offline' })));
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
    if (next.events.length > prev.events.length) {
      hapticSave();
      showToast(TOAST_COPY.sleepStart);
      noteLogged();
    }
    setState(next);
  }, [showToast, noteLogged]);

  // Sheet saves: only fire when the user taps Save (opening a sheet logs
  // nothing). Each shows its toast only when an event was actually added — the
  // anti-spam guard in addFeed/addDiaper swallows a rapid second save silently.
  const saveFeed = useCallback((details?: FeedDetails) => {
    const prev = stateRef.current;
    const next = addFeed(prev, details);
    if (next.events.length > prev.events.length) {
      hapticSave();
      showToast(TOAST_COPY.feed);
      noteLogged('feed_log_created');
    }
    setState(next);
  }, [showToast, noteLogged]);

  const saveDiaper = useCallback((details?: DiaperDetails) => {
    const prev = stateRef.current;
    const next = addDiaper(prev, details);
    if (next.events.length > prev.events.length) {
      hapticSave();
      showToast(TOAST_COPY.diaper);
      noteLogged();
    }
    setState(next);
  }, [showToast, noteLogged]);

  const saveNote = useCallback((details?: NoteDetails) => {
    // Notes are explicit (no dedup) → always added, always toast.
    hapticSave();
    showToast(TOAST_COPY.note);
    noteLogged();
    setState((prev) => addNote(prev, details ?? { label: NOTE_PRESET_LABEL }));
  }, [showToast, noteLogged]);

  const savePump = useCallback((details?: PumpDetails) => {
    // Pumps are explicit side-logs (no dedup, no orb state) → always added, always toast.
    hapticSave();
    showToast(TOAST_COPY.pump);
    noteLogged();
    setState((prev) => addPump(prev, details));
  }, [showToast, noteLogged]);

  const onPrimaryAction = useCallback(() => {
    const prev = stateRef.current;
    const next = handlePrimaryAction(prev);
    // Toast only for the two sleep transitions; End feed / Done don't add or
    // change an event (their toast already showed on the original tap).
    if (prev.orbView === 'calm' && next.events.length > prev.events.length) {
      hapticSave();
      showToast(TOAST_COPY.sleepStart);
      noteLogged();
    } else if (prev.orbView === 'sleep') {
      hapticSave();
      showToast(TOAST_COPY.sleepEnd);
      noteLogged('sleep_log_created');
    }
    setState(next);
  }, [showToast, noteLogged]);

  const undoLastEvent = useCallback(() => {
    hapticUndo();
    // Supabase (shared night): only ever remove THIS caregiver's most recent
    // event so Undo can't delete a partner's newer one. Local-only: newest
    // overall (single-caregiver device — unchanged). If the caregiver id is
    // somehow unknown in sync mode, fall back to the safe local behavior.
    const repository = repositoryRef.current;
    const ownerId = repository.mode === 'supabase' ? repository.caregiverId : undefined;
    setState((prev) => (ownerId ? undoLastOwnEvent(prev, ownerId) : undoLastEventPure(prev)));
    dismissToast();
  }, [dismissToast]);

  const resetLocalEvents = useCallback(() => {
    // Local debug-only affordance. In Supabase mode it must NEVER push the seed
    // or delete a partner's real night, so it's a no-op there (just clears any
    // toast). The seed-restore path is local-only.
    if (repositoryRef.current.mode === 'supabase') {
      dismissToast();
      return;
    }
    void repositoryRef.current.clear();
    setState(initTonightState(seedEvents));
    // Also forget the device-local "caught up" cursor so the reseeded night
    // shows its catch-up story again (not "Nothing new"). Bump the nonce once
    // the clear lands so the cursor hook re-reads it without a reload.
    void clearHandoffCursor(LOCAL_CURSOR_CONTEXT).finally(() => setResetNonce((n) => n + 1));
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
      syncMode,
      syncStatus,
      toast,
      handleSleepTap,
      saveFeed,
      saveDiaper,
      saveNote,
      savePump,
      handlePrimaryAction: onPrimaryAction,
      undoLastEvent,
      dismissToast,
      resetLocalEvents,
      resetNonce,
    }),
    [
      state,
      isHydrated,
      syncMode,
      syncStatus,
      toast,
      handleSleepTap,
      saveFeed,
      saveDiaper,
      saveNote,
      savePump,
      onPrimaryAction,
      undoLastEvent,
      dismissToast,
      resetLocalEvents,
      resetNonce,
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
