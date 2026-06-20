/**
 * Logging v2 — domain errors (plan §1.3 `error: LoggingError | null`).
 *
 * A plain, serializable error object (NOT an `Error` subclass) so it can live
 * directly in store state and be rendered as a recover/error UI (plan §6
 * "show a recover/error state instead of saving an invalid record"). Validators
 * in `rules.ts` return these instead of throwing.
 */

export type LoggingErrorCode =
  | 'invalid_bottle_amount'
  | 'invalid_session_range'
  | 'started_in_future'
  | 'invalid_breast_segments'
  | 'invalid_pump_volumes'
  | 'invalid_diaper_kind'
  /** Undo-finish refused: another active session of the same kind appeared (plan §8). */
  | 'undo_conflict'
  /** Undo requested with nothing to restore (no previous snapshot). */
  | 'undo_unavailable';

export interface LoggingError {
  code: LoggingErrorCode;
  message: string;
}

export function loggingError(code: LoggingErrorCode, message: string): LoggingError {
  return { code, message };
}
