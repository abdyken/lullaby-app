/**
 * Logging v2 — feature flag (plan §2.1).
 *
 * `loggingV2` lets the new logging domain ship BESIDE the old MVP: while it is
 * `false`, the app renders the existing flows untouched; flipped on (first for
 * dev/test accounts), the rest of the app can route to the v2 repository/store/
 * flows added in later tasks. Deliberately tiny and dependency-light so it is
 * safe to import from anywhere — including the Node smoke test (no React Native).
 *
 * Resolution order:
 *   1. an explicit runtime override (dev menu / tests) when set, else
 *   2. the build-time env default `EXPO_PUBLIC_LOGGING_V2` ("true"/"1"), else
 *   3. `false` — the production default during the migration period.
 */

/** The flags the logging feature understands. Extend as later phases add more. */
export interface LoggingFeatureFlags {
  loggingV2: boolean;
}

/** Production default during the migration: the old MVP is what users see. */
export const DEFAULT_LOGGING_FLAGS: LoggingFeatureFlags = { loggingV2: false };

/** Runtime override; `null` means "defer to the env / default". */
let loggingV2Override: boolean | null = null;

/** Build-time default from the Expo public env (inlined at build; also readable under Node). */
function envLoggingV2(): boolean {
  const raw = process.env.EXPO_PUBLIC_LOGGING_V2;
  return raw === 'true' || raw === '1';
}

/** Whether the new logging system is active right now. */
export function isLoggingV2Enabled(): boolean {
  return loggingV2Override ?? envLoggingV2();
}

/**
 * Force the flag on/off at runtime (dev menu, test-account rollout, unit tests).
 * Pass `null` to clear the override and fall back to the env/default.
 */
export function setLoggingV2Enabled(enabled: boolean | null): void {
  loggingV2Override = enabled;
}

/** Snapshot of all resolved flags — handy for a single store/provider read. */
export function resolveLoggingFlags(): LoggingFeatureFlags {
  return { loggingV2: isLoggingV2Enabled() };
}

/** Clear any runtime override. Primarily for test isolation. */
export function resetLoggingFlags(): void {
  loggingV2Override = null;
}
