/**
 * Repository contract for the logging v2 system.
 *
 * The UI and store must not know whether data lives in AsyncStorage,
 * SQLite, WatermelonDB, or on the server. All I/O goes through this
 * boundary. The concrete implementation can be swapped without touching
 * any application or UI code.
 */
import type { CareEvent } from '../domain/types';

export interface LoggingRepository {
  /**
   * Load all events that occurred today (after midnight in local time)
   * for the given family/child scope. Active sessions whose startedAt is
   * today are included; soft-deleted events are excluded.
   */
  getTodayEvents(params: {
    familyId: string;
    childId: string;
  }): Promise<CareEvent[]>;

  /**
   * Load all events with status === 'active' for the given scope.
   * Used to restore active sessions after app restart or foreground.
   */
  getActiveSessions(params: {
    familyId: string;
    childId: string;
    userId: string;
  }): Promise<CareEvent[]>;

  /** Persist a new event. Throws on unrecoverable storage failure. */
  createEvent(event: CareEvent): Promise<void>;

  /** Overwrite an existing event by id. Throws if not found or storage fails. */
  updateEvent(event: CareEvent): Promise<void>;

  /**
   * Mark an event as deleted (status = 'deleted') without removing it
   * from storage — needed for Undo and server sync reconciliation.
   */
  softDeleteEvent(eventId: string): Promise<void>;

  /**
   * Mark an event as pending remote sync. No-op in local-only mode;
   * implemented by adapters that bridge the remote sync queue.
   */
  enqueueSync(eventId: string): Promise<void>;
}
