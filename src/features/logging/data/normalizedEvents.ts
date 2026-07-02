/**
 * Canonical logging read helpers.
 *
 * The production engine stores new events as `CareEvent`s, while old users may
 * still have legacy `LogEvent`s under `lullaby/local-events/v1` or Supabase's
 * current events table. These helpers keep that compatibility read-through
 * deterministic: v2 rows win, legacy rows keep stable ids, and duplicates collapse
 * by id/clientEventId.
 */
import type { LogEvent } from '@/data/models';

import type { CareEvent } from '../domain/types';
import type { LoggingSnapshot } from './loggingPersistence';
import { mapLegacyEvents } from './LegacyLoggingMapper';

export type CanonicalEventRange = {
  fromMs: number;
  toMs: number;
};

const ms = (iso: string | null): number => (iso == null ? Number.NaN : Date.parse(iso));

function eventStartedAt(event: CareEvent): number {
  const startedAt = ms(event.startedAt);
  return Number.isFinite(startedAt) ? startedAt : ms(event.occurredAt);
}

function eventEndedAt(event: CareEvent, fallbackEndMs: number): number {
  const endedAt = ms(event.endedAt);
  if (Number.isFinite(endedAt)) return endedAt;
  return event.status === 'active' ? fallbackEndMs : eventStartedAt(event);
}

function overlapsRange(event: CareEvent, range: CanonicalEventRange): boolean {
  if (!Number.isFinite(range.fromMs) || !Number.isFinite(range.toMs) || range.fromMs > range.toMs) {
    return false;
  }

  if (event.type === 'sleep') {
    const start = eventStartedAt(event);
    const end = eventEndedAt(event, range.toMs);
    return Number.isFinite(start) && Number.isFinite(end) && start <= range.toMs && end >= range.fromMs;
  }

  const occurredAt = ms(event.occurredAt);
  return Number.isFinite(occurredAt) && occurredAt >= range.fromMs && occurredAt <= range.toMs;
}

function sameCanonicalEvent(a: CareEvent, b: CareEvent): boolean {
  return (
    a.id === b.id ||
    a.clientEventId === b.clientEventId ||
    a.id === b.clientEventId ||
    a.clientEventId === b.id
  );
}

function sortNewestFirst(events: CareEvent[]): CareEvent[] {
  return events.sort((a, b) => {
    const byOccurredAt = ms(b.occurredAt) - ms(a.occurredAt);
    if (byOccurredAt !== 0) return byOccurredAt;
    const byCreatedAt = ms(b.createdAt) - ms(a.createdAt);
    if (byCreatedAt !== 0) return byCreatedAt;
    return b.id.localeCompare(a.id);
  });
}

/**
 * Merge canonical v2 rows with compatibility rows. Compatibility rows are added
 * first, then canonical rows replace any matching legacy projection.
 */
export function mergeCanonicalEvents(
  canonicalEvents: readonly CareEvent[],
  compatibilityEvents: readonly CareEvent[] = [],
): CareEvent[] {
  const merged: CareEvent[] = [];

  function add(event: CareEvent) {
    const index = merged.findIndex((existing) => sameCanonicalEvent(existing, event));
    if (index >= 0) merged[index] = event;
    else merged.push(event);
  }

  compatibilityEvents.forEach(add);
  canonicalEvents.forEach(add);
  return sortNewestFirst(merged);
}

export function selectCanonicalEventsInRange(
  events: readonly CareEvent[],
  range: CanonicalEventRange,
): CareEvent[] {
  return sortNewestFirst(events.filter((event) => overlapsRange(event, range)));
}

/**
 * Pure, idempotent migration helper for a future copy-forward migration. The app
 * currently uses read-through compatibility; this helper proves the same merge
 * can be safely persisted later without duplicating rows.
 */
export function migrateLegacyEventsToLoggingSnapshot(
  snapshot: LoggingSnapshot,
  legacyEvents: readonly LogEvent[],
): LoggingSnapshot {
  return {
    ...snapshot,
    events: mergeCanonicalEvents(snapshot.events, mapLegacyEvents([...legacyEvents])),
    syncQueue: Array.from(new Set(snapshot.syncQueue)),
  };
}
