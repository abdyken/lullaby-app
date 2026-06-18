/**
 * Sync layer types — the boundary between the UI/state and where night data
 * actually lives (local AsyncStorage vs Supabase).
 *
 * Deliberately tiny and dependency-light: it imports only TYPES from the pure
 * data modules, so nothing here pulls React Native or Supabase into a graph that
 * doesn't need it. The concrete repositories (local / supabase) implement this.
 */
import type { TonightState } from '@/data/localInteractions';
import type { LogEvent } from '@/data/models';

/** Where the current night's events are being read from / written to. */
export type SyncMode = 'local-only' | 'supabase';

/**
 * A minimal, idempotent diff of the event list for granular remote writes.
 * `upserts` covers both new events and edits (e.g. a sleep gaining its endAt);
 * `removedIds` covers deletions (e.g. Undo). Upserting by id is idempotent, so
 * re-applying a change after a flaky network never duplicates a row.
 */
export type EventChanges = {
  upserts: LogEvent[];
  removedIds: string[];
};

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
  /**
   * The signed-in caregiver this instance writes as (Supabase only; undefined for
   * local-only). The state layer uses it to scope a "safe Undo" to the current
   * caregiver's own most recent event, so a shared night's Undo never deletes a
   * partner's newer event.
   */
  readonly caregiverId?: string;
  /** Load the persisted night state, or null if there is none to adopt. */
  load(): Promise<TonightState | null>;
  /** Persist the full night state (best-effort; must never throw). */
  save(state: TonightState): Promise<void>;
  /** Drop the persisted state (debug reset / sign-out). */
  clear(): Promise<void>;
  /**
   * Apply a granular diff (per-event upserts + deletes). Optional: the local
   * repository persists whole state via save(), so it omits this. The Supabase
   * repository implements it so a single tap writes one row and Undo deletes one
   * row — no whole-night upsert (which can't express deletions). Rejects on
   * failure so the caller can surface an offline status.
   */
  applyChanges?(changes: EventChanges): Promise<void>;
  /**
   * Subscribe to remote changes for this backend's scope. Optional: the local
   * repository has no remote, so it omits this. The Supabase repository pushes a
   * fresh TonightState whenever the shared events change. Returns an unsubscribe
   * function — call it on unmount / sign-out.
   */
  subscribe?(onRemoteChange: (state: TonightState) => void): () => void;
}
