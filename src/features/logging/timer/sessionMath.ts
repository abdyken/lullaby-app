/**
 * Logging v2 — session time math (plan §5 storage rule, §6 timers).
 *
 * Pure, clock-free helpers that derive elapsed time from stored timestamps. The
 * storage rule is strict: an active session persists only `startedAt`/`endedAt`
 * (and breast side segments) — never a ticking counter — so every duration here
 * is recomputed as `now - startedAt`. That is what lets a timer survive
 * background/restart: re-read the stored start and recompute (plan §6).
 *
 * No React, no I/O — callers pass `now` explicitly (from a `Clock`), so this is
 * fully unit-testable with a fake clock and runnable under the Node smoke test.
 */
import type { BreastSideSegment, CareEvent, ISODateTime } from '../domain/types';

const ms = (iso: ISODateTime): number => Date.parse(iso);

/**
 * Elapsed milliseconds between `startedAt` and `endedAt ?? now`. Clamped to ≥ 0
 * so a backwards clock never renders a negative timer; use {@link isReversedRange}
 * to detect that anomaly and surface a recover/error state instead of trusting
 * the duration (plan §6 time validations). Unparseable input yields 0.
 */
export function elapsedMs(
  startedAt: ISODateTime,
  endedAt: ISODateTime | null,
  now: number,
): number {
  const start = ms(startedAt);
  if (Number.isNaN(start)) return 0;
  const end = endedAt === null ? now : ms(endedAt);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - start);
}

/**
 * True when the range runs backwards — `endedAt` (or `now`, for a running
 * session) is before `startedAt`. This means a clock change or bad input; the
 * store turns it into an error rather than saving/believing the duration
 * (plan §6 "show a recover/error state instead of saving an invalid record").
 */
export function isReversedRange(
  startedAt: ISODateTime,
  endedAt: ISODateTime | null,
  now: number,
): boolean {
  const start = ms(startedAt);
  if (Number.isNaN(start)) return false;
  const end = endedAt === null ? now : ms(endedAt);
  if (Number.isNaN(end)) return false;
  return end < start;
}

/**
 * Total elapsed time of a session event. Running sessions (`endedAt === null`)
 * count up to `now`; completed sessions use their fixed `endedAt`. Instant
 * events (no `startedAt`) have no duration → 0.
 */
export function sessionElapsedMs(event: CareEvent, now: number): number {
  if (event.startedAt === null) return 0;
  return elapsedMs(event.startedAt, event.endedAt, now);
}

/**
 * Per-side totals for a breastfeeding session, summed from its segments. The
 * open (still-running) segment counts up to `now`. Totals are always derived
 * from segments — never stored as the source of truth — so multiple side
 * switches add up correctly after a restart (plan §4.1, Phase 5.3).
 */
export function breastSegmentTotals(
  segments: BreastSideSegment[],
  now: number,
): { totalLeftMs: number; totalRightMs: number } {
  let totalLeftMs = 0;
  let totalRightMs = 0;
  for (const segment of segments) {
    const span = elapsedMs(segment.startedAt, segment.endedAt, now);
    if (segment.side === 'left') {
      totalLeftMs += span;
    } else {
      totalRightMs += span;
    }
  }
  return { totalLeftMs, totalRightMs };
}

/**
 * Stopwatch text for a duration: `M:SS`, or `H:MM:SS` once there is an hour.
 * Pass `{ alwaysHours: true }` to force `HH:MM:SS` (e.g. the Sleep "00:42:18"
 * hero readout, plan §Phase 6). Negative input is clamped to 0.
 */
export function formatClock(
  durationMs: number,
  options: { alwaysHours?: boolean } = {},
): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0 || options.alwaysHours) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

/**
 * Compact human duration for subtitles: `9m`, `1h 24m`, `1h` (plan §7.1
 * examples "Sleeping · 1m", "Awake for 1h 24m"). Seconds are dropped; negative
 * input is clamped to `0m`.
 */
export function formatCompactDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}
