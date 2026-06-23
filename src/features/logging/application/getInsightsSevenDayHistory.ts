/**
 * Read-only logging history helper for future Insights.
 *
 * This is intentionally repository-backed instead of state-backed: `LoggingState`
 * only contains today's timeline slice, while Insights needs a seven-day range.
 */
import type { CareEvent } from '../domain/types';
import type { LoggingRepository, TodayEventsQuery } from '../data/LoggingRepository';

export const INSIGHTS_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function getInsightsSevenDayHistory(
  repo: LoggingRepository,
  scope: TodayEventsQuery,
  nowMs = Date.now(),
): Promise<CareEvent[]> {
  return repo.getEventsInRange({
    ...scope,
    fromMs: nowMs - INSIGHTS_HISTORY_WINDOW_MS,
    toMs: nowMs,
  });
}
