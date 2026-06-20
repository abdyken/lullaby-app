/**
 * Feature flags for the Lullaby app.
 *
 * loggingV2: when true, the new logging system (Feed/Sleep/Diaper/Pump with
 * active sessions, side timers, and volume entry) is shown instead of the
 * legacy LogSheet quick-log. Enable for dev/test accounts first.
 */
export const featureFlags = {
  loggingV2: false,
} as const;

export type FeatureFlags = typeof featureFlags;
