/**
 * Logging v2 — repository contract (plan §5).
 *
 * The single boundary the store/use-cases talk to. The UI and store must not
 * know whether an event lives in AsyncStorage, SQLite, or on the server (plan
 * §5); they call this interface and let `LoggingRepositoryImpl` decide. Realtime
 * and conflict handling (plan §9) are intentionally NOT here yet — they layer on
 * later without reshaping these methods.
 *
 * Pure types only — no React Native, no I/O — so this is importable from
 * anywhere, including the Node smoke test.
 */
import type { CareEvent } from '../domain/types';

/** Scope for the timeline read. One child's day within a family. */
export interface TodayEventsQuery {
  familyId: string;
  childId: string;
}

/**
 * Scope for active-session recovery. `userId` is the current caregiver, needed
 * because a pump session belongs to the caregiver (`subjectUserId`), not the
 * child (plan §4.4 / §4 session rules).
 */
export interface ActiveSessionsQuery {
  familyId: string;
  childId: string;
  userId: string;
}

export interface LoggingRepository {
  /**
   * Today's events for the timeline, newest first. Excludes soft-deleted and
   * cancelled events (plan §8); active sessions ARE included so the timeline can
   * badge them.
   */
  getTodayEvents(params: TodayEventsQuery): Promise<CareEvent[]>;

  /**
   * Active (`status === 'active'`) sessions in scope: sleep/breast for the child,
   * pump for the caregiver. Used to restore timers after restart (plan §6 / §4).
   */
  getActiveSessions(params: ActiveSessionsQuery): Promise<CareEvent[]>;

  /**
   * Persist a new event. Idempotent by `clientEventId` — a retried create never
   * inserts a duplicate (plan §9). Use `updateEvent` to change an existing one.
   */
  createEvent(event: CareEvent): Promise<void>;

  /** Replace an existing event, stamping `updatedAt` and bumping `version` (plan §9). */
  updateEvent(event: CareEvent): Promise<void>;

  /** Soft-delete: mark `status = 'deleted'` (never hard-remove — plan §2.4 / §8). */
  softDeleteEvent(eventId: string): Promise<void>;

  /** Queue an event id for a background backend write (plan §1.4 sync queue). */
  enqueueSync(eventId: string): Promise<void>;
}
