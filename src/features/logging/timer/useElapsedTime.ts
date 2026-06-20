/**
 * useElapsedTime — display-only hook for active session timers.
 *
 * Returns elapsed milliseconds since `startedAt`. While `isActive` is true,
 * the return value updates once per second. The source of truth is always the
 * ISO timestamp — never a stored counter.
 *
 * Strategy: a tick counter in state is incremented by the setInterval callback
 * to trigger re-renders. The elapsed value itself is computed from the startedAt
 * prop during each render — no ref reads or synchronous setState in effect bodies.
 */
import { useEffect, useState } from 'react';

import type { ISODateTime } from '../domain/types';
import { calcElapsedMs } from './sessionMath';

export function useElapsedTime(startedAt: ISODateTime | null, isActive: boolean): number {
  // Incrementing this triggers a re-render so the returned elapsed time refreshes.
  // The tick value itself is never read for calculation.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isActive || !startedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isActive, startedAt]);

  // Computed from the prop on every render — pure, O(1), no ref needed.
  return calcElapsedMs(startedAt);
}
