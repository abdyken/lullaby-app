/**
 * Logging v2 — validators (plan §1.1 minimum validators, §6 time validations).
 *
 * Pure functions that return a `ValidationResult` instead of throwing, so the
 * application layer can drop the error into store state and render a recover/
 * error UI rather than persisting an invalid record (plan §6). No clock or I/O
 * here — callers pass timestamps and `now` explicitly.
 */

import { loggingError, type LoggingError } from './errors';
import type { BreastSideSegment, DiaperKind, ISODateTime, PumpEvent } from './types';

export type ValidationResult = { ok: true } | { ok: false; error: LoggingError };

const OK: ValidationResult = { ok: true };
const fail = (error: LoggingError): ValidationResult => ({ ok: false, error });

/** ms-since-epoch for an ISO string, or null if it does not parse. */
function parseIso(value: ISODateTime): number | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Sanity guard, not a product limit — rejects obvious fat-finger / garbage input. */
export const BOTTLE_MAX_ML = 4000;
export const PUMP_MAX_ML = 2000;

const DIAPER_KINDS: readonly DiaperKind[] = ['wet', 'dirty', 'both', 'dry'];

/** Bottle volume must be a real, positive amount (plan Phase 3: no save when `<= 0`). */
export function validateBottleAmount(amountMl: number): ValidationResult {
  if (!Number.isFinite(amountMl) || amountMl <= 0) {
    return fail(loggingError('invalid_bottle_amount', 'Bottle amount must be greater than 0 ml.'));
  }
  if (amountMl > BOTTLE_MAX_ML) {
    return fail(
      loggingError('invalid_bottle_amount', `Bottle amount must be at most ${BOTTLE_MAX_ML} ml.`),
    );
  }
  return OK;
}

/**
 * A session's time range. `endedAt` null means still running (valid). When a
 * `now` is supplied, also rejects a start in the future (plan §6 / Phase 6.2).
 */
export function validateSessionRange(
  startedAt: ISODateTime,
  endedAt: ISODateTime | null,
  now?: number,
): ValidationResult {
  const start = parseIso(startedAt);
  if (start === null) {
    return fail(loggingError('invalid_session_range', 'Session start is not a valid timestamp.'));
  }
  if (now != null && start > now) {
    return fail(loggingError('started_in_future', 'Session cannot start in the future.'));
  }
  if (endedAt !== null) {
    const end = parseIso(endedAt);
    if (end === null) {
      return fail(loggingError('invalid_session_range', 'Session end is not a valid timestamp.'));
    }
    if (end < start) {
      return fail(loggingError('invalid_session_range', 'Session cannot end before it started.'));
    }
  }
  return OK;
}

/**
 * Breast side segments must form a clean, non-overlapping, chronological chain
 * with at most one open (running) segment, which must be the last (plan §5).
 * An empty list is structurally valid — the caller guarantees ≥1 for a real
 * session.
 */
export function validateBreastSegments(segments: BreastSideSegment[]): ValidationResult {
  if (!Array.isArray(segments)) {
    return fail(loggingError('invalid_breast_segments', 'Breast segments must be a list.'));
  }
  let prevEnd: number | null = null;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.side !== 'left' && seg.side !== 'right') {
      return fail(loggingError('invalid_breast_segments', 'Breast segment side must be left or right.'));
    }
    const start = parseIso(seg.startedAt);
    if (start === null) {
      return fail(loggingError('invalid_breast_segments', 'Breast segment start is not a valid timestamp.'));
    }
    const isOpen = seg.endedAt === null;
    const isLast = i === segments.length - 1;
    if (isOpen && !isLast) {
      return fail(loggingError('invalid_breast_segments', 'Only the last breast segment may be open.'));
    }
    // A new segment cannot start before the previous one closed.
    if (prevEnd !== null && start < prevEnd) {
      return fail(loggingError('invalid_breast_segments', 'Breast segments must not overlap.'));
    }
    if (isOpen) {
      prevEnd = null;
    } else {
      const end = parseIso(seg.endedAt as ISODateTime);
      if (end === null) {
        return fail(loggingError('invalid_breast_segments', 'Breast segment end is not a valid timestamp.'));
      }
      if (end < start) {
        return fail(loggingError('invalid_breast_segments', 'A breast segment cannot end before it started.'));
      }
      prevEnd = end;
    }
  }
  return OK;
}

/**
 * Pump volumes (plan §7). A recorded volume is positive; "no volume" is `null`,
 * not 0 (plan §7.3 reserves 0 for the explicit "save without volume" action).
 * Side and volumes must agree: a single-side pump cannot record the other side.
 */
export function validatePumpVolumes(details: PumpEvent['details']): ValidationResult {
  const { side, leftVolumeMl, rightVolumeMl } = details;
  if (side !== 'left' && side !== 'right' && side !== 'both') {
    return fail(loggingError('invalid_pump_volumes', 'Pump side must be left, right or both.'));
  }
  if (side === 'left' && rightVolumeMl !== null) {
    return fail(loggingError('invalid_pump_volumes', 'A left pump cannot record a right volume.'));
  }
  if (side === 'right' && leftVolumeMl !== null) {
    return fail(loggingError('invalid_pump_volumes', 'A right pump cannot record a left volume.'));
  }
  const bad = checkVolume(leftVolumeMl, 'Left') ?? checkVolume(rightVolumeMl, 'Right');
  return bad ? fail(bad) : OK;
}

function checkVolume(volume: number | null, label: string): LoggingError | null {
  if (volume === null) return null; // null = not recorded (save without volume)
  if (!Number.isFinite(volume) || volume <= 0) {
    return loggingError(
      'invalid_pump_volumes',
      `${label} volume must be greater than 0 ml (use “save without volume” for none).`,
    );
  }
  if (volume > PUMP_MAX_ML) {
    return loggingError('invalid_pump_volumes', `${label} volume must be at most ${PUMP_MAX_ML} ml.`);
  }
  return null;
}

/** Diaper kind must be one of the four supported values (plan §4.3). */
export function validateDiaperKind(kind: string): ValidationResult {
  if (!DIAPER_KINDS.includes(kind as DiaperKind)) {
    return fail(loggingError('invalid_diaper_kind', 'Diaper kind must be wet, dirty, both or dry.'));
  }
  return OK;
}
