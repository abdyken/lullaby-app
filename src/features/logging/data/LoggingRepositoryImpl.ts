/**
 * AsyncStorage-backed implementation of LoggingRepository.
 *
 * Storage key is versioned separately from the legacy lullaby/local-events/v1
 * so old and new formats can coexist during migration.
 *
 * The store is a flat JSON array of CareEvent objects. This is intentionally
 * simple — a queryable event store can replace it later without changing the
 * LoggingRepository interface.
 *
 * All public methods are safe to call concurrently: the in-memory cache is
 * updated synchronously before the AsyncStorage write completes, so callers
 * that read immediately after write see the new value.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CareEvent } from '../domain/types';
import type { LoggingRepository } from './LoggingRepository';

const STORAGE_KEY = 'lullaby/logging-v2/events';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSameDay(isoA: string, isoB: string): boolean {
  return isoA.slice(0, 10) === isoB.slice(0, 10);
}

function localTodayPrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isTodayEvent(event: CareEvent): boolean {
  const today = localTodayPrefix();
  const anchor = event.startedAt ?? event.occurredAt;
  return isSameDay(anchor, today);
}

// ─── Serialization ────────────────────────────────────────────────────────────

function parseStoredEvents(raw: string | null): CareEvent[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CareEvent[];
  } catch {
    return [];
  }
}

// ─── In-memory cache ─────────────────────────────────────────────────────────
// Avoids re-reading AsyncStorage on every call within the same JS runtime.

let cachedEvents: CareEvent[] | null = null;
let cacheLoaded = false;

async function loadAll(): Promise<CareEvent[]> {
  if (cacheLoaded && cachedEvents !== null) return cachedEvents;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cachedEvents = parseStoredEvents(raw);
    cacheLoaded = true;
    return cachedEvents;
  } catch {
    return [];
  }
}

async function persistAll(events: CareEvent[]): Promise<void> {
  cachedEvents = events;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // best-effort — cache still reflects the intended state for this session
  }
}

// ─── Implementation ───────────────────────────────────────────────────────────

export const loggingRepositoryImpl: LoggingRepository = {
  async getTodayEvents({ familyId, childId }) {
    const all = await loadAll();
    return all.filter(
      (e) =>
        e.familyId === familyId &&
        (e.childId === childId || e.childId === null) &&
        e.status !== 'deleted' &&
        isTodayEvent(e),
    );
  },

  async getActiveSessions({ familyId, childId, userId }) {
    const all = await loadAll();
    return all.filter(
      (e) =>
        e.familyId === familyId &&
        (e.childId === childId || e.childId === null) &&
        e.createdByUserId === userId &&
        e.status === 'active',
    );
  },

  async createEvent(event) {
    const all = await loadAll();
    // Guard against duplicate clientEventId (idempotent create)
    const exists = all.some((e) => e.clientEventId === event.clientEventId);
    if (exists) return;
    await persistAll([...all, event]);
  },

  async updateEvent(event) {
    const all = await loadAll();
    const index = all.findIndex((e) => e.id === event.id);
    if (index === -1) {
      // Event not found — treat as create (handles race with first write)
      await persistAll([...all, event]);
      return;
    }
    const updated = [...all];
    updated[index] = event;
    await persistAll(updated);
  },

  async softDeleteEvent(eventId) {
    const all = await loadAll();
    const index = all.findIndex((e) => e.id === eventId);
    if (index === -1) return;
    const updated = [...all];
    const existing = updated[index];
    const now = new Date().toISOString();
    updated[index] = { ...existing, status: 'deleted', updatedAt: now };
    await persistAll(updated);
  },

  async enqueueSync(_eventId) {
    // No-op in local-only mode. A future sync adapter will override this
    // to push the eventId into a persistent sync queue.
  },
};

/**
 * Drop all v2 events from storage. Used only in dev/test resets.
 * Does NOT touch the legacy lullaby/local-events/v1 key.
 */
export async function clearLoggingV2Storage(): Promise<void> {
  cachedEvents = null;
  cacheLoaded = false;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
