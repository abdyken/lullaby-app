/**
 * Logging v2 — public API barrel (plan §2.3 "hide it behind a single logging
 * feature API").
 *
 * The rest of the app should import the new logging domain from here, not reach
 * into individual files. As later tasks add the repository, store, and flows,
 * their public surface is re-exported from this module.
 */

export * from './domain/types';
export * from './domain/errors';
export * from './domain/ids';
export * from './domain/rules';
export * from './timer/clock';
export * from './timer/sessionMath';

// Feature flag + repository/service layer (plan §1.2, §2.1, §5).
export * from './config/featureFlags';
export * from './data/LoggingRepository';
export * from './data/LoggingRepositoryImpl';
export * from './data/LegacyLoggingMapper';
export * from './data/loggingPersistence';
export * from './data/normalizedEvents';

// Active-session state, selectors, and hydration (plan §1.3, §6, Phase 4).
export * from './state/loggingStore';
export * from './state/loggingSelectors';
export * from './state/loggingHydration';
// Timeline + quick-log presentation selectors (plan §7.1, §7.4).
export * from './state/timelineSelectors';

// Application use-cases (plan §3). Pure + Node-safe (no React, no AsyncStorage).
export * from './application';

// NOTE: a few files are intentionally NOT re-exported here so this barrel stays
// runnable under plain Node (the smoke test):
//   - './data/loggingStorage'        — imports AsyncStorage (React Native)
//   - './timer/useElapsedTime'       — a React hook (imports `react`)
//   - './timer/appStateReconcile'    — imports `react-native` AppState
//   - './state/LoggingProvider'      — a React provider (react + AsyncStorage)
//   - './feed/*'                     — React Native UI (the Feed flow)
// Import those directly from the UI/provider where they are needed.
