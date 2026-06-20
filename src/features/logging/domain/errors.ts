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
  | 'invalid_diaper_kind';

export interface LoggingError {
  code: LoggingErrorCode;
  message: string;
}

export function loggingError(code: LoggingErrorCode, message: string): LoggingError {
  return { code, message };
}
