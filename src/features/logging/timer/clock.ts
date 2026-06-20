/**
 * Logging v2 — clock abstraction (plan §6).
 *
 * A time seam so session math can be unit-tested without real waiting. The MVP
 * already injects a `now: number` into its pure helpers; this generalizes that
 * into a `Clock` the application layer can depend on. Active sessions store
 * `startedAt`/`endedAt` only — never a ticking counter — and recompute elapsed
 * time as `now - startedAt`, so the clock is the single source of "now".
 */

import type { ISODateTime } from '../domain/types';

export interface Clock {
  now(): number;
  nowIso(): ISODateTime;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};

/** A `Clock` whose time can be set/advanced — for tests (plan §11.1 "fake clock"). */
export interface ManualClock extends Clock {
  set(ms: number): void;
  advance(deltaMs: number): void;
}

export function createManualClock(initialMs: number): ManualClock {
  let current = initialMs;
  return {
    now: () => current,
    nowIso: () => new Date(current).toISOString(),
    set: (ms: number) => {
      current = ms;
    },
    advance: (deltaMs: number) => {
      current += deltaMs;
    },
  };
}
