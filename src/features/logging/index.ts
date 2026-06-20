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
