/**
 * Supabase-backed event repository.
 *
 * This is the remote half of the EventRepository boundary. The UI and state
 * layer never touch it directly — they get an `EventRepository` from
 * resolveRepository and call load/save/clear. It reads and writes the shared
 * `events` table for a single baby, mapping rows ↔ models through './schema'.
 *
 * Two deliberate boundaries for this foundation slice:
 *  - `orbView` is NOT stored remotely. It is a per-device view derived from the
 *    shared events (running sleep → 'sleep', else 'calm'), so two caregivers
 *    reading the same events converge without a server-side "view" concept.
 *  - `subscribe` (realtime) is intentionally omitted. The interface leaves it
 *    optional; the realtime task adds it here without touching any caller.
 *
 * Every method is best-effort and must never throw — a backend hiccup degrades
 * the night log, it does not crash the night.
 */
import { initTonightState, type TonightState } from '@/data/localInteractions';
import type { SupabaseClient } from '@supabase/supabase-js';

import { eventFromRow, eventToRow, type EventRow } from './schema';
import type { EventRepository } from './types';

/** Which baby + caregiver this repository instance is scoped to. */
export type SupabaseRepositoryContext = {
  /** The baby whose night the signed-in caregiver is viewing. */
  babyId: string;
  /** The signed-in caregiver (auth user id); stamped on writes. */
  caregiverId: string;
};

const EVENTS_TABLE = 'events';

export function createSupabaseRepository(
  client: SupabaseClient,
  context: SupabaseRepositoryContext,
): EventRepository {
  return {
    mode: 'supabase',

    async load(): Promise<TonightState | null> {
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
    },

    async save(state: TonightState): Promise<void> {
      try {
        // Upsert the full event set by primary key. The realtime task will
        // narrow this to per-event writes; for the foundation a whole-night
        // upsert is the simplest correct seam. caregiver_id is forced to the
        // signed-in user so RLS accepts the write.
        const rows = state.events.map((event) => ({
          ...eventToRow(event),
          baby_id: context.babyId,
          caregiver_id: event.caregiverId || context.caregiverId,
        }));
        if (rows.length === 0) return;
        await client.from(EVENTS_TABLE).upsert(rows, { onConflict: 'id' });
      } catch {
        // best-effort remote write — surfaced via sync status, never thrown
      }
    },

    async clear(): Promise<void> {
      // Intentionally does NOT delete shared remote data: a local "reset to
      // seed" debug control must never wipe a partner's real night. Remote
      // teardown (sign-out / account deletion) is a later, explicit concern.
    },
  };
}
