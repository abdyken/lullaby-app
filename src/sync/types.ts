/**
 * Sync layer types — the boundary between the UI/state and where night data
 * actually lives (local AsyncStorage vs Supabase).
 *
 * Deliberately tiny and dependency-light: it imports only TYPES from the pure
 * data modules, so nothing here pulls React Native or Supabase into a graph that
 * doesn't need it. The concrete repositories (local / supabase) implement this.
 */
import type { TonightState } from '@/data/localInteractions';

/** Where the current night's events are being read from / written to. */
export type SyncMode = 'local-only' | 'supabase';

/**
 * Calm, future-facing status for an eventual sync indicator. For this slice the
 * state layer only ever surfaces 'local-only' (no backend) or, when Supabase is
 * active, 'synced'/'syncing'/'offline' — but the full set is modelled now so the
 * next task can drive a UI without reshaping anything.
 */
export type SyncStatusKind = 'local-only' | 'syncing' | 'synced' | 'offline';

export type SyncStatus = {
  kind: SyncStatusKind;
  /** ISO timestamp of the last successful sync, or null if never / local-only. */
  lastSyncedAt: string | null;
};

/** The starting status before anything has loaded — pure local demo. */
export const LOCAL_ONLY_STATUS: SyncStatus = { kind: 'local-only', lastSyncedAt: null };

/**
 * The single boundary the state layer talks to. Both the local and Supabase
 * implementations satisfy this, so LocalEventProvider never imports a backend
 * directly. Realtime is intentionally NOT here yet — `subscribe` is the seam the
 * next task fills in (local returns a no-op unsubscribe), so wiring live events
 * later won't change this interface.
 */
export interface EventRepository {
  /** Which backend this instance represents. Drives the surfaced SyncMode. */
  readonly mode: SyncMode;
  /** Load the persisted night state, or null if there is none to adopt. */
  load(): Promise<TonightState | null>;
  /** Persist the full night state (best-effort; must never throw). */
  save(state: TonightState): Promise<void>;
  /** Drop the persisted state (debug reset / sign-out). */
  clear(): Promise<void>;
  /**
   * Subscribe to remote changes. Optional: the local repository has no remote,
   * so it omits this. The Supabase repository will implement it in the realtime
   * task. Returns an unsubscribe function.
   */
  subscribe?(onRemoteChange: (state: TonightState) => void): () => void;
}
