/**
 * Logging v2 — persistence port + pure (de)serialization (plan §5 storage rule).
 *
 * The `LoggingRepositoryImpl` talks to a `LoggingPersistencePort`, never to the
 * device directly, so it stays unit-testable with an in-memory port and the
 * concrete AsyncStorage I/O lives in one isolated file (`loggingStorage.ts`).
 * This mirrors the legacy split (`persistedState.ts` pure / `localStorage.ts`
 * device-only) and keeps THIS module runnable under plain Node/tsx — no React
 * Native, no AsyncStorage import.
 *
 * The new domain is stored UNDER ITS OWN KEY, beside the legacy
 * `lullaby/local-events/v1` store, so turning logging v2 on/off never corrupts
 * the old MVP data (plan §2.1 "create the new domain next to the old one"). The
 * `LegacyLoggingMapper` is what reads existing legacy rows into `CareEvent`s;
 * this store only holds events authored through the v2 path.
 *
 * AsyncStorage caveat (plan §5): this whole-snapshot store is fine for the MVP's
 * scale and the migration period, but it is not a queryable event store. Swapping
 * the backing store later is a port change only — the repository contract holds.
 */
import type { CareEvent, CareEventStatus, CareEventType, SyncStatus } from '../domain/types';

/** AsyncStorage key for the logging v2 snapshot. Versioned for future shape bumps. */
export const LOGGING_STORAGE_KEY = 'lullaby/logging-v2/v1';

/**
 * Everything the logging repository persists: the event list plus the pending
 * sync queue (ids awaiting a backend write — plan §1.4 / §5 `enqueueSync`).
 */
export interface LoggingSnapshot {
  events: CareEvent[];
  syncQueue: string[];
}

/** A fresh, empty snapshot. A factory (not a shared const) so callers never alias arrays. */
export function createEmptyLoggingSnapshot(): LoggingSnapshot {
  return { events: [], syncQueue: [] };
}

/** A shallow copy — the repository treats event objects as immutable, so array copies suffice. */
export function cloneLoggingSnapshot(snapshot: LoggingSnapshot): LoggingSnapshot {
  return { events: snapshot.events.slice(), syncQueue: snapshot.syncQueue.slice() };
}

/**
 * The seam the repository persists through. The in-memory implementation lives
 * here (Node-safe); the AsyncStorage one lives in `loggingStorage.ts`.
 */
export interface LoggingPersistencePort {
  /** Load the snapshot, or an empty one if nothing is stored / it is unreadable. */
  load(): Promise<LoggingSnapshot>;
  /** Persist the whole snapshot (best-effort; must never throw). */
  save(snapshot: LoggingSnapshot): Promise<void>;
  /** Drop the stored snapshot (debug reset / sign-out). */
  clear(): Promise<void>;
}

/* ----------------------------- validation ----------------------------- */

const EVENT_TYPES: readonly CareEventType[] = ['feed', 'sleep', 'diaper', 'pump'];
const EVENT_STATUSES: readonly CareEventStatus[] = ['active', 'completed', 'cancelled', 'deleted'];
const SYNC_STATUSES: readonly SyncStatus[] = ['local', 'pending', 'synced', 'failed'];

const inSet = <T extends string>(set: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (set as readonly string[]).includes(value);

/**
 * Structural guard — enough to trust a stored row without crashing the UI. It
 * does not re-run business validators (those run at write time); it just rejects
 * rows that are not shaped like a `CareEvent`.
 */
export function isStoredCareEvent(value: unknown): value is CareEvent {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.clientEventId === 'string' &&
    typeof e.familyId === 'string' &&
    (e.childId === null || typeof e.childId === 'string') &&
    typeof e.createdByUserId === 'string' &&
    inSet(EVENT_TYPES, e.type) &&
    inSet(EVENT_STATUSES, e.status) &&
    typeof e.occurredAt === 'string' &&
    (e.startedAt === null || typeof e.startedAt === 'string') &&
    (e.endedAt === null || typeof e.endedAt === 'string') &&
    typeof e.createdAt === 'string' &&
    typeof e.updatedAt === 'string' &&
    inSet(SYNC_STATUSES, e.syncStatus) &&
    typeof e.version === 'number' &&
    typeof e.details === 'object' &&
    e.details !== null
  );
}

/** Serialize the snapshot for storage. */
export function serializeLoggingSnapshot(snapshot: LoggingSnapshot): string {
  return JSON.stringify({ events: snapshot.events, syncQueue: snapshot.syncQueue });
}

/**
 * Parse + validate a stored string into a `LoggingSnapshot`. Returns `null` for
 * anything we cannot trust at the top level (not JSON / not an object) so the
 * caller can fall back to an empty snapshot. Individual malformed rows are
 * dropped rather than failing the whole load — a single bad event must never
 * cost the user their other logged events.
 */
export function parseLoggingSnapshot(raw: string | null | undefined): LoggingSnapshot | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const events = Array.isArray(obj.events) ? obj.events.filter(isStoredCareEvent) : [];
  const syncQueue = Array.isArray(obj.syncQueue)
    ? obj.syncQueue.filter((id): id is string => typeof id === 'string')
    : [];

  return { events, syncQueue };
}

/* --------------------------- in-memory port --------------------------- */

/**
 * A `LoggingPersistencePort` backed by an in-memory snapshot. Used by unit tests
 * and any Node context; it copies on read/write so callers cannot mutate stored
 * state by holding a reference.
 */
export function createInMemoryLoggingPersistence(
  initial: LoggingSnapshot = createEmptyLoggingSnapshot(),
): LoggingPersistencePort {
  let snapshot = cloneLoggingSnapshot(initial);
  return {
    load: async () => cloneLoggingSnapshot(snapshot),
    save: async (next: LoggingSnapshot) => {
      snapshot = cloneLoggingSnapshot(next);
    },
    clear: async () => {
      snapshot = createEmptyLoggingSnapshot();
    },
  };
}
