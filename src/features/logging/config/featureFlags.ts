/**
 * Logging — canonical rollout seam.
 *
 * Logging v2 is now the production logging engine. This module remains only as
 * a dependency-light compatibility seam for older imports and smoke tests; it no
 * longer reads Expo public env vars or controls product behavior.
 */

/** The flags the logging feature understands. Extend as later phases add more. */
export interface LoggingFeatureFlags {
  loggingV2: boolean;
}

/** Canonical production default. */
export const DEFAULT_LOGGING_FLAGS: LoggingFeatureFlags = { loggingV2: true };

/** Whether the new logging system is active right now. */
export function isLoggingV2Enabled(): boolean {
  return true;
}

/**
 * Compatibility no-op. Logging no longer has a normal runtime off mode; tests
 * that need legacy fixtures should call legacy mappers directly.
 */
export function setLoggingV2Enabled(_enabled: boolean | null): void {
  // no-op
}

/** Snapshot of all resolved flags — handy for a single store/provider read. */
export function resolveLoggingFlags(): LoggingFeatureFlags {
  return { loggingV2: isLoggingV2Enabled() };
}

/** Clear any runtime override. Primarily for test isolation. */
export function resetLoggingFlags(): void {
  // no-op
}
