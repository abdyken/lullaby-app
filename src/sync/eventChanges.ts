/**
 * Pure event diffing — turns "previous synced events" + "current events" into an
 * idempotent {@link EventChanges} the Supabase repository can apply granularly.
 *
 * No React, no Supabase: a plain function so the state layer can compute exactly
 * what changed (a feed added, a sleep ended, an Undo'd row removed) and push only
 * that, instead of re-uploading the whole night on every tap.
 */
import type { LogEvent } from '@/data/models';

import type { EventChanges } from './types';

/** Field-level equality for the columns we persist (id is compared by key). */
function sameEvent(a: LogEvent, b: LogEvent): boolean {
  return (
    a.type === b.type &&
    a.babyId === b.babyId &&
    a.caregiverId === b.caregiverId &&
    a.startAt === b.startAt &&
    a.endAt === b.endAt &&
    a.createdAt === b.createdAt &&
    JSON.stringify(a.meta) === JSON.stringify(b.meta)
  );
}

/**
 * Diff `prev` (last synced) against `next` (current local). An event is an
 * upsert if it's new or any field changed; an id present in `prev` but not
 * `next` is a removal. Upserting is idempotent, so a retried apply is safe.
 */
export function diffEvents(prev: LogEvent[], next: LogEvent[]): EventChanges {
  const prevById = new Map(prev.map((e) => [e.id, e]));
  const nextIds = new Set(next.map((e) => e.id));

  const upserts = next.filter((e) => {
    const before = prevById.get(e.id);
    return before == null || !sameEvent(before, e);
  });
  const removedIds = prev.filter((e) => !nextIds.has(e.id)).map((e) => e.id);

  return { upserts, removedIds };
}

/** True when there is nothing to push. */
export function isEmptyChange(changes: EventChanges): boolean {
  return changes.upserts.length === 0 && changes.removedIds.length === 0;
}
