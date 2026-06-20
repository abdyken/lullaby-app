/**
 * LoggingStore — React context + useReducer store for the logging v2 system.
 *
 * Responsibilities:
 *  - Hold the authoritative in-memory LoggingState for active sessions and
 *    today's events.
 *  - Hydrate from LoggingRepository on mount and reconcile on AppState foreground.
 *  - Expose typed actions (startSession, finishSession, cancelSession, …) that
 *    persist to the repository then dispatch to the reducer atomically.
 *
 * Design constraints (from the implementation plan):
 *  - Components must not write directly to AsyncStorage or compute timestamps.
 *  - Timer text is calculated from startedAt — do NOT store ticking counters.
 *  - One active session per type per scope (breast/child, sleep/child, pump/user).
 *  - Draft state (pumpVolumeDraft, lastMutation) lives here, not in UI components.
 */
import { AppState, type AppStateStatus } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import type {
  BreastFeedEvent,
  BottleFeedEvent,
  CareEvent,
  PumpEvent,
  PumpVolumeDraft,
  SleepEvent,
  UndoableMutation,
} from '../domain/types';
import type { LoggingRepository } from '../data/LoggingRepository';
import { loggingRepositoryImpl } from '../data/LoggingRepositoryImpl';

// ─── State ────────────────────────────────────────────────────────────────────

export interface LoggingState {
  /** True once the initial load from the repository has completed. */
  hydrated: boolean;
  /** All non-deleted events from today (sorted newest-first by occurredAt/startedAt). */
  todayEvents: CareEvent[];
  /** The currently running breast-feed session for this child, or null. */
  activeBreastFeed: BreastFeedEvent | null;
  /** The currently running sleep session for this child, or null. */
  activeSleep: SleepEvent | null;
  /** The currently running pump session for this user, or null. */
  activePump: PumpEvent | null;
  /** Pump session that has ended but volume has not yet been saved. */
  pumpVolumeDraft: PumpVolumeDraft | null;
  /** The most recent undoable mutation (for the Undo toast). */
  lastMutation: UndoableMutation | null;
  /** Last error message, cleared on next successful action. */
  error: string | null;
}

const INITIAL_STATE: LoggingState = {
  hydrated: false,
  todayEvents: [],
  activeBreastFeed: null,
  activeSleep: null,
  activePump: null,
  pumpVolumeDraft: null,
  lastMutation: null,
  error: null,
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

type LoggingAction =
  | {
      type: 'HYDRATED';
      todayEvents: CareEvent[];
      activeSessions: CareEvent[];
    }
  | { type: 'SESSIONS_RECOVERED'; activeSessions: CareEvent[] }
  | { type: 'SESSION_STARTED'; event: CareEvent }
  | { type: 'SESSION_UPDATED'; event: CareEvent }
  | { type: 'SESSION_ENDED'; event: CareEvent }
  | { type: 'SESSION_CANCELLED'; eventId: string }
  | { type: 'EVENT_CREATED'; event: CareEvent }
  | { type: 'EVENT_DELETED'; eventId: string }
  | { type: 'LAST_MUTATION_SET'; mutation: UndoableMutation | null }
  | { type: 'PUMP_VOLUME_DRAFT_SET'; draft: PumpVolumeDraft | null }
  | { type: 'ERROR_SET'; error: string | null };

/** Maps a session event to the corresponding active-field name. */
function activeFieldFor(
  event: CareEvent,
): 'activeBreastFeed' | 'activeSleep' | 'activePump' | null {
  if (event.type === 'feed') {
    const method = (event as BreastFeedEvent | BottleFeedEvent).method;
    return method === 'breast' ? 'activeBreastFeed' : null;
  }
  if (event.type === 'sleep') return 'activeSleep';
  if (event.type === 'pump') return 'activePump';
  return null;
}

/** Apply a list of active sessions onto a partial state (mutates in place). */
function applyActiveSessions(
  target: Pick<LoggingState, 'activeBreastFeed' | 'activeSleep' | 'activePump'>,
  sessions: CareEvent[],
): void {
  for (const session of sessions) {
    const field = activeFieldFor(session);
    if (field === 'activeBreastFeed') target.activeBreastFeed = session as BreastFeedEvent;
    else if (field === 'activeSleep') target.activeSleep = session as SleepEvent;
    else if (field === 'activePump') target.activePump = session as PumpEvent;
  }
}

function reducer(state: LoggingState, action: LoggingAction): LoggingState {
  switch (action.type) {
    case 'HYDRATED': {
      const next: LoggingState = {
        ...state,
        hydrated: true,
        todayEvents: action.todayEvents,
        activeBreastFeed: null,
        activeSleep: null,
        activePump: null,
      };
      applyActiveSessions(next, action.activeSessions);
      return next;
    }

    case 'SESSIONS_RECOVERED': {
      const next: LoggingState = {
        ...state,
        activeBreastFeed: null,
        activeSleep: null,
        activePump: null,
      };
      applyActiveSessions(next, action.activeSessions);
      return next;
    }

    case 'SESSION_STARTED': {
      const field = activeFieldFor(action.event);
      const todayEvents = [action.event, ...state.todayEvents];
      if (field === 'activeBreastFeed')
        return { ...state, activeBreastFeed: action.event as BreastFeedEvent, todayEvents };
      if (field === 'activeSleep')
        return { ...state, activeSleep: action.event as SleepEvent, todayEvents };
      if (field === 'activePump')
        return { ...state, activePump: action.event as PumpEvent, todayEvents };
      return state;
    }

    case 'SESSION_UPDATED': {
      const field = activeFieldFor(action.event);
      const todayEvents = state.todayEvents.map((e) =>
        e.id === action.event.id ? action.event : e,
      );
      if (field === 'activeBreastFeed')
        return { ...state, activeBreastFeed: action.event as BreastFeedEvent, todayEvents };
      if (field === 'activeSleep')
        return { ...state, activeSleep: action.event as SleepEvent, todayEvents };
      if (field === 'activePump')
        return { ...state, activePump: action.event as PumpEvent, todayEvents };
      return { ...state, todayEvents };
    }

    case 'SESSION_ENDED': {
      const field = activeFieldFor(action.event);
      const todayEvents = state.todayEvents.map((e) =>
        e.id === action.event.id ? action.event : e,
      );
      const next = { ...state, todayEvents };
      if (field === 'activeBreastFeed') next.activeBreastFeed = null;
      else if (field === 'activeSleep') next.activeSleep = null;
      else if (field === 'activePump') next.activePump = null;
      return next;
    }

    case 'SESSION_CANCELLED': {
      const todayEvents = state.todayEvents.filter((e) => e.id !== action.eventId);
      const next = { ...state, todayEvents };
      if (state.activeBreastFeed?.id === action.eventId) next.activeBreastFeed = null;
      if (state.activeSleep?.id === action.eventId) next.activeSleep = null;
      if (state.activePump?.id === action.eventId) next.activePump = null;
      return next;
    }

    case 'EVENT_CREATED':
      return { ...state, todayEvents: [action.event, ...state.todayEvents] };

    case 'EVENT_DELETED':
      return {
        ...state,
        todayEvents: state.todayEvents.filter((e) => e.id !== action.eventId),
      };

    case 'LAST_MUTATION_SET':
      return { ...state, lastMutation: action.mutation };

    case 'PUMP_VOLUME_DRAFT_SET':
      return { ...state, pumpVolumeDraft: action.draft };

    case 'ERROR_SET':
      return { ...state, error: action.error };

    default:
      return state;
  }
}

// ─── Context value ────────────────────────────────────────────────────────────

export type LoggingStoreContextValue = LoggingState & {
  /**
   * Persist and register an active session (breast, sleep, pump).
   * Creates the event in the repository and adds it to todayEvents.
   */
  startSession(event: CareEvent): Promise<void>;

  /**
   * Persist an in-progress update to an active session (e.g. breast side switch).
   * Updates the event in the repository and refreshes the active-field value.
   */
  updateSession(event: CareEvent): Promise<void>;

  /**
   * Persist a session as completed (status = 'completed', endedAt set).
   * Clears the corresponding active field.
   */
  finishSession(event: CareEvent): Promise<void>;

  /**
   * Mark an active session as cancelled (status = 'cancelled').
   * Removes it from todayEvents and clears the active field.
   */
  cancelSession(eventId: string): Promise<void>;

  /**
   * Persist an instant (non-session) event such as a diaper or bottle feed.
   * Adds the event to todayEvents without touching any active field.
   */
  createEvent(event: CareEvent): Promise<void>;

  /**
   * Soft-delete an event (status = 'deleted') and remove it from todayEvents.
   * Used by Undo and explicit delete actions.
   */
  softDeleteEvent(eventId: string): Promise<void>;

  /** Replace or clear the Undo toast mutation context. */
  setLastMutation(mutation: UndoableMutation | null): void;

  /** Update the pump volume draft (survives sheet close, cleared on save). */
  setPumpVolumeDraft(draft: PumpVolumeDraft | null): void;

  /**
   * Re-read active sessions from the repository and reconcile in-memory state.
   * Called on AppState foreground and after external data changes.
   */
  recoverActiveSessions(): Promise<void>;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const LoggingStoreContext = createContext<LoggingStoreContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

/** Default scoping IDs for local-only / demo mode (matching mock.ts constants). */
const LOCAL_FAMILY_ID = 'family-local';
const LOCAL_CHILD_ID = 'baby-mia';
const LOCAL_USER_ID = 'cg-mom';

interface LoggingStoreProviderProps {
  children: ReactNode;
  /** Override the repository (useful for tests). Defaults to AsyncStorage impl. */
  repository?: LoggingRepository;
  /** Family scope for repository queries. Defaults to local-only sentinel. */
  familyId?: string;
  /** Child scope for repository queries. Defaults to local-only sentinel. */
  childId?: string;
  /** Current user id for repository queries. Defaults to local-only sentinel. */
  userId?: string;
}

export function LoggingStoreProvider({
  children,
  repository = loggingRepositoryImpl,
  familyId = LOCAL_FAMILY_ID,
  childId = LOCAL_CHILD_ID,
  userId = LOCAL_USER_ID,
}: LoggingStoreProviderProps) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Keep a stable ref so callbacks don't capture stale repo/params.
  const repoRef = useRef(repository);
  const paramsRef = useRef({ familyId, childId, userId });
  useEffect(() => {
    repoRef.current = repository;
  }, [repository]);
  useEffect(() => {
    paramsRef.current = { familyId, childId, userId };
  }, [familyId, childId, userId]);

  // ── Hydration on mount ────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { familyId: fid, childId: cid, userId: uid } = paramsRef.current;
      const repo = repoRef.current;
      try {
        const [todayEvents, activeSessions] = await Promise.all([
          repo.getTodayEvents({ familyId: fid, childId: cid }),
          repo.getActiveSessions({ familyId: fid, childId: cid, userId: uid }),
        ]);
        if (!cancelled) {
          dispatch({ type: 'HYDRATED', todayEvents, activeSessions });
        }
      } catch {
        if (!cancelled) {
          dispatch({ type: 'HYDRATED', todayEvents: [], activeSessions: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // run once on mount

  // ── AppState reconciliation on foreground ──────────────────────────────────

  const recoverActiveSessions = useCallback(async () => {
    const { familyId: fid, childId: cid, userId: uid } = paramsRef.current;
    try {
      const activeSessions = await repoRef.current.getActiveSessions({
        familyId: fid,
        childId: cid,
        userId: uid,
      });
      dispatch({ type: 'SESSIONS_RECOVERED', activeSessions });
    } catch {
      // Non-fatal — keep current in-memory state.
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void recoverActiveSessions();
      }
    });
    return () => sub.remove();
  }, [recoverActiveSessions]);

  // ── Session actions ───────────────────────────────────────────────────────

  const startSession = useCallback(async (event: CareEvent) => {
    try {
      await repoRef.current.createEvent(event);
      await repoRef.current.enqueueSync(event.id);
      dispatch({ type: 'SESSION_STARTED', event });
      dispatch({ type: 'ERROR_SET', error: null });
    } catch (err) {
      dispatch({ type: 'ERROR_SET', error: String(err) });
      throw err;
    }
  }, []);

  const updateSession = useCallback(async (event: CareEvent) => {
    try {
      await repoRef.current.updateEvent(event);
      await repoRef.current.enqueueSync(event.id);
      dispatch({ type: 'SESSION_UPDATED', event });
      dispatch({ type: 'ERROR_SET', error: null });
    } catch (err) {
      dispatch({ type: 'ERROR_SET', error: String(err) });
      throw err;
    }
  }, []);

  const finishSession = useCallback(async (event: CareEvent) => {
    try {
      await repoRef.current.updateEvent(event);
      await repoRef.current.enqueueSync(event.id);
      dispatch({ type: 'SESSION_ENDED', event });
      dispatch({ type: 'ERROR_SET', error: null });
    } catch (err) {
      dispatch({ type: 'ERROR_SET', error: String(err) });
      throw err;
    }
  }, []);

  const cancelSession = useCallback(async (eventId: string) => {
    try {
      // Load the event, mark as cancelled, persist.
      // We soft-delete via status='cancelled' using updateEvent.
      // The reducer removes it from todayEvents immediately (optimistic).
      dispatch({ type: 'SESSION_CANCELLED', eventId });
      // Best-effort remote mark: if the event can't be found it's already gone.
      await repoRef.current.softDeleteEvent(eventId).catch(() => undefined);
      dispatch({ type: 'ERROR_SET', error: null });
    } catch (err) {
      dispatch({ type: 'ERROR_SET', error: String(err) });
      throw err;
    }
  }, []);

  const createEvent = useCallback(async (event: CareEvent) => {
    try {
      await repoRef.current.createEvent(event);
      await repoRef.current.enqueueSync(event.id);
      dispatch({ type: 'EVENT_CREATED', event });
      dispatch({ type: 'ERROR_SET', error: null });
    } catch (err) {
      dispatch({ type: 'ERROR_SET', error: String(err) });
      throw err;
    }
  }, []);

  const softDeleteEvent = useCallback(async (eventId: string) => {
    try {
      await repoRef.current.softDeleteEvent(eventId);
      await repoRef.current.enqueueSync(eventId);
      dispatch({ type: 'EVENT_DELETED', eventId });
      dispatch({ type: 'ERROR_SET', error: null });
    } catch (err) {
      dispatch({ type: 'ERROR_SET', error: String(err) });
      throw err;
    }
  }, []);

  const setLastMutation = useCallback((mutation: UndoableMutation | null) => {
    dispatch({ type: 'LAST_MUTATION_SET', mutation });
  }, []);

  const setPumpVolumeDraft = useCallback((draft: PumpVolumeDraft | null) => {
    dispatch({ type: 'PUMP_VOLUME_DRAFT_SET', draft });
  }, []);

  // ── Context value ─────────────────────────────────────────────────────────

  const value: LoggingStoreContextValue = {
    ...state,
    startSession,
    updateSession,
    finishSession,
    cancelSession,
    createEvent,
    softDeleteEvent,
    setLastMutation,
    setPumpVolumeDraft,
    recoverActiveSessions,
  };

  return <LoggingStoreContext.Provider value={value}>{children}</LoggingStoreContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** Access the logging store. Must be used inside a LoggingStoreProvider. */
export function useLoggingStore(): LoggingStoreContextValue {
  const ctx = useContext(LoggingStoreContext);
  if (!ctx) {
    throw new Error('useLoggingStore must be used within a LoggingStoreProvider');
  }
  return ctx;
}
