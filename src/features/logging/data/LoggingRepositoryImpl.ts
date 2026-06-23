/**
 * Logging v2 — repository implementation (plan §1.2, §5).
 *
 * Adapts the storage port (in-memory in tests, AsyncStorage on device) into the
 * `LoggingRepository` contract. It owns the data-layer concerns the plan calls
 * for: idempotent create by `clientEventId`, `version`/`updatedAt` stamping on
 * write, soft-delete, the "today" timeline read, and active-session recovery.
 *
 * Storage rule (plan §5): no ticking counter is ever persisted — sessions store
 * `startedAt`/`endedAt`, and elapsed time is recomputed from them. This layer
 * just stores and queries those timestamps.
 *
 * Pure (no React Native): it depends only on a `LoggingPersistencePort` and a
 * `Clock`, both injectable, so it runs under the Node smoke test.
 */
import type { Clock } from '../timer/clock';
import type { CareEvent } from '../domain/types';
import type {
  ActiveSessionsQuery,
  EventsInRangeQuery,
  LoggingRepository,
  TodayEventsQuery,
} from './LoggingRepository';
import type { LoggingPersistencePort, LoggingSnapshot } from './loggingPersistence';

const ms = (iso: string): number => Date.parse(iso);

function occurredAtMs(event: CareEvent): number {
  return ms(event.occurredAt);
}

/** Same local calendar day — used for the "today" timeline window. */
function isSameLocalDay(aMs: number, bMs: number): boolean {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Whether an event belongs in this child's timeline. Pump shows family-wide (plan §4.4). */
function belongsToChildTimeline(event: CareEvent, childId: string): boolean {
  if (event.type === 'pump') return true;
  return event.childId === childId;
}

function isTimelineVisible(event: CareEvent): boolean {
  return event.status !== 'deleted' && event.status !== 'cancelled';
}

function timelineEventsForScope(
  events: CareEvent[],
  familyId: string,
  childId: string,
): CareEvent[] {
  return events
    .filter((e) => e.familyId === familyId)
    .filter((e) => belongsToChildTimeline(e, childId))
    .filter(isTimelineVisible);
}

/**
 * Whether an active session is "mine" in this context: sleep/breast are scoped
 * to the child (one each per child), a pump is scoped to the caregiver who owns
 * it (one per `subjectUserId`) — plan §4 session rules.
 */
function isActiveInContext(event: CareEvent, childId: string, userId: string): boolean {
  if (event.type === 'pump') return event.subjectUserId === userId;
  return event.childId === childId;
}

export function createLoggingRepository(
  port: LoggingPersistencePort,
  clock: Clock,
): LoggingRepository {
  /** Load → transform → save, so every mutation is read-modify-write on the snapshot. */
  async function mutate(fn: (snapshot: LoggingSnapshot) => LoggingSnapshot): Promise<void> {
    const snapshot = await port.load();
    await port.save(fn(snapshot));
  }

  return {
    async getTodayEvents({ familyId, childId }: TodayEventsQuery): Promise<CareEvent[]> {
      const { events } = await port.load();
      const now = clock.now();
      return timelineEventsForScope(events, familyId, childId)
        .filter((e) => isSameLocalDay(occurredAtMs(e), now))
        .sort((a, b) => occurredAtMs(b) - occurredAtMs(a));
    },

    async getEventsInRange({
      familyId,
      childId,
      fromMs,
      toMs,
    }: EventsInRangeQuery): Promise<CareEvent[]> {
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) return [];

      const { events } = await port.load();
      return timelineEventsForScope(events, familyId, childId)
        .filter((event) => {
          const timestamp = occurredAtMs(event);
          return Number.isFinite(timestamp) && timestamp >= fromMs && timestamp <= toMs;
        })
        .sort((a, b) => occurredAtMs(b) - occurredAtMs(a));
    },

    async getActiveSessions({
      familyId,
      childId,
      userId,
    }: ActiveSessionsQuery): Promise<CareEvent[]> {
      const { events } = await port.load();
      return events
        .filter((e) => e.status === 'active' && e.familyId === familyId)
        .filter((e) => isActiveInContext(e, childId, userId))
        .sort((a, b) => ms(a.startedAt ?? a.occurredAt) - ms(b.startedAt ?? b.occurredAt));
    },

    async createEvent(event: CareEvent): Promise<void> {
      await mutate((snapshot) => {
        // Idempotency key guard: a retried create must not duplicate (plan §9).
        if (snapshot.events.some((e) => e.clientEventId === event.clientEventId)) {
          return snapshot;
        }
        return { ...snapshot, events: [...snapshot.events, event] };
      });
    },

    async updateEvent(event: CareEvent): Promise<void> {
      await mutate((snapshot) => {
        const index = snapshot.events.findIndex((e) => e.id === event.id);
        const baseVersion = index >= 0 ? snapshot.events[index].version : event.version;
        const stamped = {
          ...event,
          updatedAt: clock.nowIso(),
          version: baseVersion + 1,
        } as CareEvent;
        const events =
          index >= 0
            ? snapshot.events.map((e, i) => (i === index ? stamped : e))
            : [...snapshot.events, stamped];
        return { ...snapshot, events };
      });
    },

    async softDeleteEvent(eventId: string): Promise<void> {
      await mutate((snapshot) => ({
        ...snapshot,
        events: snapshot.events.map((e) =>
          e.id === eventId
            ? ({ ...e, status: 'deleted', updatedAt: clock.nowIso(), version: e.version + 1 } as CareEvent)
            : e,
        ),
      }));
    },

    async enqueueSync(eventId: string): Promise<void> {
      await mutate((snapshot) =>
        snapshot.syncQueue.includes(eventId)
          ? snapshot
          : { ...snapshot, syncQueue: [...snapshot.syncQueue, eventId] },
      );
    },
  };
}
