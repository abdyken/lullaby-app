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

// Feature flag + repository/service layer (plan §1.2, §2.1, §5).
export * from './config/featureFlags';
export * from './data/LoggingRepository';
export * from './data/LoggingRepositoryImpl';
export * from './data/LegacyLoggingMapper';
export * from './data/loggingPersistence';
// NOTE: './data/loggingStorage' is intentionally NOT re-exported here — it imports
// AsyncStorage (React Native). Import it directly where a device-backed repository
// is needed, so this barrel stays runnable under plain Node (the smoke test).
