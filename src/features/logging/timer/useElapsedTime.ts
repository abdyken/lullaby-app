/**
 * Logging v2 — display-only elapsed-time hook (plan §6 "Hook only for display").
 *
 * Returns `clock.now() - startedAt` in milliseconds and re-renders once per
 * second WHILE `isActive`. It deliberately persists nothing: the value is
 * DERIVED during render from the stored `startedAt`, and the interval only nudges
 * a re-render (a tick) — there is no elapsed counter held in state and no
 * setState inside the effect body. Background/restart simply recompute from the
 * timestamp; there is no JS interval to keep alive in the background (plan §6).
 *
 * This is a React hook, so it is NOT re-exported from the logging barrel (which
 * stays React-free for the Node smoke test). Import it directly from the UI.
 * All the math lives in `sessionMath`, which the Node smoke test covers.
 */
import { useEffect, useReducer } from 'react';

import { type Clock, systemClock } from './clock';
import { elapsedMs } from './sessionMath';

/**
 * @param startedAt ISO start of the active session, or `null` when idle.
 * @param isActive  whether to tick — pause the per-second redraw when false.
 * @param clock     time source; defaults to the system clock (overridable in tests).
 */
export function useElapsedTime(
  startedAt: string | null,
  isActive: boolean,
  clock: Clock = systemClock,
): number {
  // A monotonic tick whose only job is to force a re-render each second while
  // active. The dispatch identity is stable, so it needs no effect dependency.
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!isActive || startedAt === null) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, isActive]);

  // Derived during render → always fresh, including the moment inputs change.
  return startedAt === null ? 0 : elapsedMs(startedAt, null, clock.now());
}
