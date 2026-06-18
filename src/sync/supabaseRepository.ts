/**
 * Supabase-backed event repository.
 *
 * This is the remote half of the EventRepository boundary. The UI and state
 * layer never touch it directly — they get an `EventRepository` from
 * resolveRepository and call load / applyChanges / subscribe. It reads and
 * writes the shared `events` table for a single baby, mapping rows ↔ models
 * through './schema'.
 *
 * Design:
 *  - `orbView` is NOT stored remotely. It is a per-device view derived from the
 *    shared events (running sleep → 'sleep', else 'calm'), so two caregivers
 *    reading the same events converge without a server-side "view" concept.
 *  - Writes are GRANULAR (`applyChanges`): one row per tap, a delete per Undo.
 *    Upserts are by id (idempotent → a retried write never duplicates), and
 *    deletes express what a whole-night upsert never could. `save()` remains as
 *    a whole-state fallback but the state layer uses applyChanges in sync mode.
 *  - `subscribe` opens a realtime channel filtered to this baby and, on any
 *    INSERT/UPDATE/DELETE, re-reads the night and hands back a fresh state. A
 *    full re-read (rather than payload reconciliation) keeps it simple and
 *    correct; at newborn-night event volume the cost is trivial. A short debounce
 *    coalesces bursts.
 *
 * load / applyChanges reject only on real failures so the state layer can show a
 * calm offline status; load() swallows to null so a read hiccup just keeps the
 * current view.
 */
import { initTonightState, type TonightState } from '@/data/localInteractions';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import { eventFromRow, eventToRow, type EventRow } from './schema';
import type { EventChanges, EventRepository } from './types';

/** Which baby + caregiver this repository instance is scoped to. */
export type SupabaseRepositoryContext = {
  /** The baby whose night the signed-in caregiver is viewing. */
  babyId: string;
  /** The signed-in caregiver (auth user id); stamped on writes. */
  caregiverId: string;
};

const EVENTS_TABLE = 'events';
/** Coalesce a burst of realtime changes into one re-read. */
const REALTIME_DEBOUNCE_MS = 200;

export function createSupabaseRepository(
  client: SupabaseClient,
  context: SupabaseRepositoryContext,
): EventRepository {
  /** Read the baby's events newest-first and shape a TonightState, or null. */
  async function loadState(): Promise<TonightState | null> {
    try {
      const { data, error } = await client
        .from(EVENTS_TABLE)
        .select('*')
        .eq('baby_id', context.babyId)
        .order('created_at', { ascending: false });
      if (error || !data) return null;
      const events = (data as EventRow[]).map(eventFromRow);
      // Derive orbView locally from the shared events (same rule as the seed).
      return initTonightState(events);
    } catch {
      return null;
    }
  }

  /** Stamp a row to this baby + caregiver so RLS accepts the write. */
  function rowFor(event: EventChanges['upserts'][number]) {
    return {
      ...eventToRow(event),
      baby_id: context.babyId,
      caregiver_id: event.caregiverId || context.caregiverId,
    };
  }

  return {
    mode: 'supabase',
    caregiverId: context.caregiverId,

    load: loadState,

    async save(state: TonightState): Promise<void> {
      // Whole-state fallback (the state layer prefers applyChanges). Upsert by
      // id is idempotent; it cannot delete, so it's not used for Undo.
      try {
        const rows = state.events.map(rowFor);
        if (rows.length === 0) return;
        await client.from(EVENTS_TABLE).upsert(rows, { onConflict: 'id' });
      } catch {
        // best-effort; surfaced via sync status
      }
    },

    async applyChanges({ upserts, removedIds }: EventChanges): Promise<void> {
      // Deletes first, then upserts. Both scoped to this baby. Rejects on error
      // so the caller can flip to an offline status.
      if (removedIds.length > 0) {
        const { error } = await client
          .from(EVENTS_TABLE)
          .delete()
          .eq('baby_id', context.babyId)
          .in('id', removedIds);
        if (error) throw error;
      }
      if (upserts.length > 0) {
        const { error } = await client
          .from(EVENTS_TABLE)
          .upsert(upserts.map(rowFor), { onConflict: 'id' });
        if (error) throw error;
      }
    },

    async clear(): Promise<void> {
      // Intentionally does NOT delete shared remote data: a local "reset to
      // seed" debug control must never wipe a partner's real night. Remote
      // teardown (sign-out / account deletion) is a separate, explicit concern.
    },

    subscribe(onRemoteChange: (state: TonightState) => void): () => void {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let closed = false;

      const refresh = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void loadState().then((state) => {
            // Skip a failed read (keep the current view) and ignore late
            // callbacks after teardown.
            if (!closed && state) onRemoteChange(state);
          });
        }, REALTIME_DEBOUNCE_MS);
      };

      const channel: RealtimeChannel = client
        .channel(`events:${context.babyId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: EVENTS_TABLE,
            filter: `baby_id=eq.${context.babyId}`,
          },
          refresh,
        )
        .subscribe();

      return () => {
        closed = true;
        if (timer) clearTimeout(timer);
        void client.removeChannel(channel);
      };
    },
  };
}
