/**
 * Pure session math helpers for the Lullaby logging timer system.
 *
 * All functions are side-effect-free and accept an optional `nowMs` parameter
 * so they can be tested deterministically without real clock calls.
 */
import type { BreastSideSegment, ISODateTime } from '../domain/types';

/**
 * Returns the elapsed milliseconds from `startedAt` to now (or a given `nowMs`).
 * Returns 0 for null/invalid input — never negative.
 */
export function calcElapsedMs(startedAt: ISODateTime | null, nowMs?: number): number {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, (nowMs ?? Date.now()) - start);
}

/**
 * Sums left and right breast-feed segment durations.
 * Open segments (endedAt === null) are counted up to `nowMs`.
 */
export function calcBreastSegmentTotals(
  segments: BreastSideSegment[],
  nowMs?: number,
): { totalLeftMs: number; totalRightMs: number } {
  const now = nowMs ?? Date.now();
  let totalLeftMs = 0;
  let totalRightMs = 0;
  for (const seg of segments) {
    const start = new Date(seg.startedAt).getTime();
    const end = seg.endedAt ? new Date(seg.endedAt).getTime() : now;
    const duration = Math.max(0, end - start);
    if (seg.side === 'left') {
      totalLeftMs += duration;
    } else {
      totalRightMs += duration;
    }
  }
  return { totalLeftMs, totalRightMs };
}

/**
 * Formats elapsed milliseconds as a timer string.
 *
 * Under one hour:  "MM:SS"   (e.g. "04:32")
 * One hour or more: "H:MM:SS" (e.g. "1:04:32")
 */
export function formatElapsedTime(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Formats elapsed milliseconds as a human-readable label for Quick Log cards.
 *
 * Examples: "3m", "1h 4m", "2h"
 */
export function formatElapsedHuman(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
