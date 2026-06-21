/**
 * Logging v2 — store state + pure transitions (plan §1.3).
 *
 * The plan does NOT mandate Redux/Zustand/MobX — it says to use the existing
 * state manager behind a single logging API (plan §2.3). The MVP already follows
 * a "pure helpers + thin React provider" pattern (src/data/localInteractions.ts),
 * so this mirrors it: the shape and every transition live here as pure functions
 * (no React, no I/O), and a provider (added with the UI) holds the state and
 * calls these. That keeps the whole store unit-testable under the Node smoke test.
 *
 * The central structural fix from the audit: distinct `activeSleep` /
 * `activeBreastFeed` / `activePump` slots replace the single `orbView`, so
 * concurrent sessions (e.g. sleep + pump) are representable (plan §4 / Phase 4).
 * No ticking counter is stored — durations are derived from timestamps via
 * `sessionMath`.
 */
import type { LoggingError } from '../domain/errors';
import type {
  BreastFeedEvent,
  CareEvent,
  PumpEvent,
  PumpVolumeDraft,
  SleepEvent,
  UndoableMutation,
} from '../domain/types';
import {
  isPumpVolumeDraft,
  pumpEventToVolumeDraft,
  selectActiveBreastFeed,
  selectActivePump,
  selectActiveSleep,
} from './loggingSelectors';

/** Logging feature state (plan §1.3). UI drafts stay separate from saved events. */
export interface LoggingState {
  /** False until the first `hydrateLoggingState` resolves; UI shows a loading shell. */
  hydrated: boolean;
  /** Today's timeline source (newest first), from the repository. */
  todayEvents: CareEvent[];
  activeBreastFeed: BreastFeedEvent | null;
  activeSleep: SleepEvent | null;
  activePump: PumpEvent | null;
  /** A finished pump session awaiting its optional volume (plan §7.2). */
  pumpVolumeDraft: PumpVolumeDraft | null;
  /** Backs the single live Undo (plan §8); replaced by each new mutation. */
  lastMutation: UndoableMutation | null;
  /** Recover/error state (e.g. clock change), rendered instead of crashing (plan §6). */
  error: LoggingError | null;
}

/** A fresh, empty state. A factory (not a shared const) so callers never alias arrays. */
export function createInitialLoggingState(): LoggingState {
  return {
    hydrated: false,
    todayEvents: [],
    activeBreastFeed: null,
    activeSleep: null,
    activePump: null,
    pumpVolumeDraft: null,
    lastMutation: null,
    error: null,
  };
}

/** Mark the store hydrated (after the launch read resolves). */
export function setHydrated(state: LoggingState, hydrated = true): LoggingState {
  return { ...state, hydrated };
}

/** Replace the timeline source with a fresh read. */
export function applyTodayEvents(state: LoggingState, todayEvents: CareEvent[]): LoggingState {
  return { ...state, todayEvents };
}

/**
 * Derive the active-session slots from a list of active sessions (typically
 * `repository.getActiveSessions`). Pump is matched to `subjectUserId` so a
 * co-caregiver's pump never lands in this device's slot (plan §4 session rules).
 *
 * A pump's timer being finished is encoded as an `active` event with `endedAt`
 * set (so it stays in `getActiveSessions` and survives a restart). Such an event
 * is surfaced as a `pumpVolumeDraft` while `activePump` still holds the full
 * record so the provider can complete/cancel it (plan Phase 7.2). The draft is
 * therefore derived from persisted data on every hydrate/reconcile — it is never
 * lost on close or restart.
 */
export function applyActiveSessions(
  state: LoggingState,
  activeSessions: CareEvent[],
  subjectUserId: string,
): LoggingState {
  const activePump = selectActivePump(activeSessions, subjectUserId);
  return {
    ...state,
    activeBreastFeed: selectActiveBreastFeed(activeSessions),
    activeSleep: selectActiveSleep(activeSessions),
    activePump,
    pumpVolumeDraft: isPumpVolumeDraft(activePump) ? pumpEventToVolumeDraft(activePump!) : null,
  };
}

/** Set the recover/error state (plan §6). */
export function withError(state: LoggingState, error: LoggingError): LoggingState {
  return { ...state, error };
}

/** Clear any recover/error state. */
export function clearError(state: LoggingState): LoggingState {
  return state.error === null ? state : { ...state, error: null };
}

/** Set/clear the persistent pump volume draft (plan §7.2). */
export function withPumpVolumeDraft(
  state: LoggingState,
  pumpVolumeDraft: PumpVolumeDraft | null,
): LoggingState {
  return { ...state, pumpVolumeDraft };
}

/** Record the latest undoable mutation, replacing any prior Undo context (plan §8). */
export function withLastMutation(
  state: LoggingState,
  lastMutation: UndoableMutation | null,
): LoggingState {
  return { ...state, lastMutation };
}
