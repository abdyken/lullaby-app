/**
 * Reassure recap windows.
 *
 * Current context (default on the Reassure screen):
 *   - 18:00–23:59  → [today 18:00, now]              label 'tonight'
 *   - 00:00–09:59  → [yesterday 18:00, now]          label 'tonight'   (the 2am case)
 *   - 10:00–17:59  → [today 10:00, now]              label 'today'
 *
 * Finished-night recap (intentional morning recap):
 *   - 10:00–17:59  → [yesterday 18:00, today 10:00]  label 'last-night'
 *
 * Local-time math uses the Date component constructor (never fixed 24h
 * offsets), so DST transitions roll over correctly — the same approach as
 * startOfLocalDay in src/features/insights/insightSelectors.ts.
 *
 * PURE LEAF: no react/react-native imports; deterministic given `now`.
 */

import type { NightWindow } from './types';

/** Local hour the night window opens. */
export const NIGHT_RECAP_START_HOUR = 18;
/** Local hour the morning cutoff closes a finished night. */
export const NIGHT_RECAP_END_HOUR = 10;
/** Local hour the daytime current context opens. */
export const DAY_CONTEXT_START_HOUR = NIGHT_RECAP_END_HOUR;

export function nightWindowFor(now: number): NightWindow {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const hour = d.getHours();

  if (hour >= NIGHT_RECAP_START_HOUR) {
    return {
      startMs: new Date(y, m, day, NIGHT_RECAP_START_HOUR).getTime(),
      endMs: now,
      label: 'tonight',
    };
  }
  if (hour < NIGHT_RECAP_END_HOUR) {
    return {
      startMs: new Date(y, m, day - 1, NIGHT_RECAP_START_HOUR).getTime(),
      endMs: now,
      label: 'tonight',
    };
  }
  return {
    startMs: new Date(y, m, day - 1, NIGHT_RECAP_START_HOUR).getTime(),
    endMs: new Date(y, m, day, NIGHT_RECAP_END_HOUR).getTime(),
    label: 'last-night',
  };
}

export function currentContextWindowFor(now: number): NightWindow {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const hour = d.getHours();

  if (hour >= NIGHT_RECAP_START_HOUR || hour < NIGHT_RECAP_END_HOUR) {
    return nightWindowFor(now);
  }

  return {
    startMs: new Date(y, m, day, DAY_CONTEXT_START_HOUR).getTime(),
    endMs: now,
    label: 'today',
  };
}
